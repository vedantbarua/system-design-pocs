package com.randomproject.youtubetopk;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

@Service
public class VideoService {
    private static final Pattern ID_PATTERN = Pattern.compile("^[A-Za-z0-9._:-]+$");
    private static final Pattern TAG_PATTERN = Pattern.compile("^[A-Za-z0-9 ._:/&'#-]+$");

    private final Map<String, VideoRecord> videos = new HashMap<>();
    private final int defaultLimit;
    private final int maxLimit;
    private final int maxTags;
    private final int maxTagLength;
    private final int maxTitleLength;
    private final int maxChannelLength;
    private final int maxIdLength;
    private final int viewWeight;
    private final int likeWeight;

    public VideoService(
            @Value("${topk.default-limit:5}") int defaultLimit,
            @Value("${topk.max-limit:50}") int maxLimit,
            @Value("${topk.max-tags:6}") int maxTags,
            @Value("${topk.max-tag-length:24}") int maxTagLength,
            @Value("${topk.max-title-length:120}") int maxTitleLength,
            @Value("${topk.max-channel-length:60}") int maxChannelLength,
            @Value("${topk.max-id-length:40}") int maxIdLength,
            @Value("${topk.view-weight:1}") int viewWeight,
            @Value("${topk.like-weight:4}") int likeWeight) {
        this.defaultLimit = defaultLimit;
        this.maxLimit = maxLimit;
        this.maxTags = maxTags;
        this.maxTagLength = maxTagLength;
        this.maxTitleLength = maxTitleLength;
        this.maxChannelLength = maxChannelLength;
        this.maxIdLength = maxIdLength;
        this.viewWeight = viewWeight;
        this.likeWeight = likeWeight;
        seedDefaults();
    }

    public int getDefaultLimit() {
        return defaultLimit;
    }

    public int getMaxTags() {
        return maxTags;
    }

    public int getViewWeight() {
        return viewWeight;
    }

    public int getLikeWeight() {
        return likeWeight;
    }

    public synchronized List<VideoRecord> allVideos() {
        return videos.values().stream()
                .sorted(Comparator.comparing(VideoRecord::getUpdatedAt).reversed())
                .toList();
    }

    public synchronized List<VideoScore> topK(String tagFilter, Integer limit) {
        String normalizedTag = normalizeTagFilter(tagFilter);
        int resolvedLimit = normalizeLimit(limit);
        return videos.values().stream()
                .filter(video -> normalizedTag == null || video.hasTag(normalizedTag))
                .sorted(rankComparator())
                .limit(resolvedLimit)
                .map(video -> new VideoScore(video, scoreFor(video)))
                .toList();
    }

    public synchronized VideoRecord upsert(String id,
                                           String title,
                                           String channel,
                                           List<String> tags,
                                           Long views,
                                           Long likes) {
        String normalizedId = normalizeId(id);
        String normalizedTitle = normalizeText(title, maxTitleLength, "Title");
        String normalizedChannel = normalizeText(channel, maxChannelLength, "Channel");
        List<String> normalizedTags = normalizeTags(tags);
        Long resolvedViews = normalizeMetric(views, "Views");
        Long resolvedLikes = normalizeMetric(likes, "Likes");
        VideoRecord existing = videos.get(normalizedId);
        Instant now = Instant.now();
        if (existing == null) {
            long viewValue = resolvedViews == null ? 0L : resolvedViews;
            long likeValue = resolvedLikes == null ? 0L : resolvedLikes;
            VideoRecord created = new VideoRecord(
                    normalizedId,
                    normalizedTitle,
                    normalizedChannel,
                    normalizedTags,
                    viewValue,
                    likeValue,
                    now,
                    now
            );
            videos.put(normalizedId, created);
            return created;
        }
        existing.update(normalizedTitle, normalizedChannel, normalizedTags, resolvedViews, resolvedLikes, now);
        return existing;
    }

    public synchronized VideoRecord recordEngagement(String id, Long viewDelta, Long likeDelta) {
        String normalizedId = normalizeId(id);
        VideoRecord record = videos.get(normalizedId);
        if (record == null) {
            throw new IllegalArgumentException("Video not found: " + normalizedId);
        }
        long resolvedViews = viewDelta == null ? 0L : viewDelta;
        long resolvedLikes = likeDelta == null ? 0L : likeDelta;
        if (resolvedViews < 0 || resolvedLikes < 0) {
            throw new IllegalArgumentException("Engagement deltas cannot be negative.");
        }
        if (resolvedViews == 0 && resolvedLikes == 0) {
            throw new IllegalArgumentException("Provide at least one engagement delta.");
        }
        record.increment(resolvedViews, resolvedLikes, Instant.now());
        return record;
    }

    private void seedDefaults() {
        Instant now = Instant.now();
        seed("vid-101", "Tokyo Night Food Tour", "Street Eats", List.of("food", "travel", "tokyo"), 182_000, 14_500, now);
        seed("vid-102", "Lo-fi Focus Mix", "Signal Studio", List.of("music", "focus", "lofi"), 780_000, 92_000, now);
        seed("vid-103", "Build a Tiny AI", "Dev Relay", List.of("tech", "ai", "tutorial"), 210_000, 33_000, now);
        seed("vid-104", "Hidden Trails in Yosemite", "Trail Seekers", List.of("travel", "hiking", "nature"), 95_000, 8_200, now);
        seed("vid-105", "Minimalist Desk Setup", "Pixel Habitat", List.of("design", "workspace", "review"), 165_000, 21_500, now);
        seed("vid-106", "Beginner Yoga Flow", "Everyday Zen", List.of("wellness", "fitness", "yoga"), 310_000, 44_000, now);
        seed("vid-107", "Streetwear Lookbook", "Mode Lab", List.of("fashion", "style"), 120_000, 12_300, now);
        seed("vid-108", "How to Roast Coffee", "Roastworks", List.of("coffee", "food", "guide"), 73_000, 6_900, now);
    }

    private void seed(String id,
                      String title,
                      String channel,
                      List<String> tags,
                      long views,
                      long likes,
                      Instant now) {
        VideoRecord record = new VideoRecord(id, title, channel, tags, views, likes, now, now);
        videos.put(id, record);
    }

    private long scoreFor(VideoRecord record) {
        return (record.getViews() * viewWeight) + (record.getLikes() * likeWeight);
    }

    private Comparator<VideoRecord> rankComparator() {
        return Comparator.<VideoRecord>comparingLong(this::scoreFor).reversed()
                .thenComparing(VideoRecord::getLikes, Comparator.reverseOrder())
                .thenComparing(VideoRecord::getViews, Comparator.reverseOrder())
                .thenComparing(VideoRecord::getUpdatedAt, Comparator.reverseOrder())
                .thenComparing(VideoRecord::getTitle, String.CASE_INSENSITIVE_ORDER);
    }

    private int normalizeLimit(Integer limit) {
        int resolved = limit == null ? defaultLimit : limit;
        if (resolved < 1) {
            throw new IllegalArgumentException("Limit must be at least 1.");
        }
        if (resolved > maxLimit) {
            throw new IllegalArgumentException("Limit cannot exceed " + maxLimit + ".");
        }
        return resolved;
    }

    private String normalizeId(String id) {
        if (!StringUtils.hasText(id)) {
            throw new IllegalArgumentException("Video id cannot be empty.");
        }
        String trimmed = id.trim();
        if (trimmed.length() > maxIdLength) {
            throw new IllegalArgumentException("Video id is too long (max " + maxIdLength + ").");
        }
        if (!ID_PATTERN.matcher(trimmed).matches()) {
            throw new IllegalArgumentException("Video id may use letters, numbers, and . _ : - characters.");
        }
        return trimmed;
    }

    private String normalizeText(String value, int maxLength, String label) {
        if (!StringUtils.hasText(value)) {
            throw new IllegalArgumentException(label + " cannot be empty.");
        }
        String trimmed = value.trim().replaceAll("\\s+", " ");
        if (trimmed.length() > maxLength) {
            throw new IllegalArgumentException(label + " is too long (max " + maxLength + ").");
        }
        return trimmed;
    }

    private Long normalizeMetric(Long value, String label) {
        if (value == null) {
            return null;
        }
        if (value < 0) {
            throw new IllegalArgumentException(label + " cannot be negative.");
        }
        return value;
    }

    private List<String> normalizeTags(List<String> tags) {
        if (tags == null || tags.isEmpty()) {
            return List.of();
        }
        List<String> cleaned = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        for (String tag : tags) {
            if (!StringUtils.hasText(tag)) {
                continue;
            }
            String trimmed = tag.trim().replaceAll("\\s+", " ");
            if (trimmed.length() > maxTagLength) {
                throw new IllegalArgumentException("Tag '" + trimmed + "' is too long (max " + maxTagLength + ").");
            }
            if (!TAG_PATTERN.matcher(trimmed).matches()) {
                throw new IllegalArgumentException("Tags may use letters, numbers, spaces, and . _ : / & ' - # characters.");
            }
            String normalized = trimmed.toLowerCase(Locale.ROOT);
            if (seen.add(normalized)) {
                cleaned.add(trimmed);
            }
            if (cleaned.size() > maxTags) {
                throw new IllegalArgumentException("At most " + maxTags + " tags are allowed.");
            }
        }
        return cleaned;
    }

    private String normalizeTagFilter(String tagFilter) {
        if (!StringUtils.hasText(tagFilter)) {
            return null;
        }
        String trimmed = tagFilter.trim().replaceAll("\\s+", " ");
        if (trimmed.length() > maxTagLength) {
            throw new IllegalArgumentException("Tag filter is too long (max " + maxTagLength + ").");
        }
        if (!TAG_PATTERN.matcher(trimmed).matches()) {
            throw new IllegalArgumentException("Tag filter may use letters, numbers, spaces, and . _ : / & ' - # characters.");
        }
        return trimmed.toLowerCase(Locale.ROOT);
    }
}
