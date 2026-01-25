package com.randomproject.youtubetopk;

import java.time.Instant;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.stream.Collectors;

public class VideoRecord {
    private final String id;
    private String title;
    private String channel;
    private List<String> tags;
    private Set<String> tagSet;
    private long views;
    private long likes;
    private final Instant createdAt;
    private Instant updatedAt;

    public VideoRecord(String id,
                       String title,
                       String channel,
                       List<String> tags,
                       long views,
                       long likes,
                       Instant createdAt,
                       Instant updatedAt) {
        this.id = id;
        this.title = title;
        this.channel = channel;
        setTags(tags);
        this.views = views;
        this.likes = likes;
        this.createdAt = createdAt;
        this.updatedAt = updatedAt;
    }

    public String getId() {
        return id;
    }

    public String getTitle() {
        return title;
    }

    public String getChannel() {
        return channel;
    }

    public List<String> getTags() {
        return tags;
    }

    public long getViews() {
        return views;
    }

    public long getLikes() {
        return likes;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public boolean hasTag(String normalizedTag) {
        return tagSet.contains(normalizedTag);
    }

    public void update(String title,
                       String channel,
                       List<String> tags,
                       Long views,
                       Long likes,
                       Instant updatedAt) {
        this.title = title;
        this.channel = channel;
        setTags(tags);
        if (views != null) {
            this.views = views;
        }
        if (likes != null) {
            this.likes = likes;
        }
        this.updatedAt = updatedAt;
    }

    public void increment(long viewDelta, long likeDelta, Instant updatedAt) {
        this.views += viewDelta;
        this.likes += likeDelta;
        this.updatedAt = updatedAt;
    }

    private void setTags(List<String> tags) {
        if (tags == null || tags.isEmpty()) {
            this.tags = List.of();
            this.tagSet = Collections.emptySet();
            return;
        }
        List<String> copy = List.copyOf(tags);
        this.tags = copy;
        this.tagSet = copy.stream()
                .map(tag -> tag.toLowerCase(Locale.ROOT))
                .collect(Collectors.toSet());
    }
}
