package com.randomproject.newsfeed;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.Deque;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

@Service
public class NewsFeedService {
    private final Map<Long, UserProfile> users = new ConcurrentHashMap<>();
    private final Map<Long, Set<Long>> following = new ConcurrentHashMap<>();
    private final Map<Long, Deque<FeedPost>> postsByUser = new ConcurrentHashMap<>();
    private final AtomicLong userIdSequence = new AtomicLong(1000);
    private final AtomicLong postIdSequence = new AtomicLong(5000);
    private final int maxPostsPerUser;
    private final int defaultFeedSize;

    public NewsFeedService(
            @Value("${app.max-posts-per-user:200}") int maxPostsPerUser,
            @Value("${app.feed-size:50}") int defaultFeedSize
    ) {
        this.maxPostsPerUser = maxPostsPerUser;
        this.defaultFeedSize = defaultFeedSize;
        seed();
    }

    public List<UserProfile> listUsers() {
        return users.values().stream()
                .sorted(Comparator.comparing(UserProfile::createdAt))
                .toList();
    }

    public Optional<UserProfile> findUser(long userId) {
        return Optional.ofNullable(users.get(userId));
    }

    public UserProfile createUser(String name) {
        String trimmedName = name == null ? "" : name.trim();
        if (trimmedName.isEmpty()) {
            throw new IllegalArgumentException("User name is required.");
        }
        long id = userIdSequence.incrementAndGet();
        UserProfile user = new UserProfile(id, trimmedName, Instant.now());
        users.put(id, user);
        following.putIfAbsent(id, ConcurrentHashMap.newKeySet());
        postsByUser.putIfAbsent(id, new ArrayDeque<>());
        return user;
    }

    public void follow(long followerId, long followeeId) {
        if (followerId == followeeId) {
            throw new IllegalArgumentException("Users cannot follow themselves.");
        }
        requireUser(followerId);
        requireUser(followeeId);
        following.computeIfAbsent(followerId, key -> ConcurrentHashMap.newKeySet()).add(followeeId);
    }

    public List<UserProfile> listFollowing(long userId) {
        requireUser(userId);
        return following.getOrDefault(userId, Set.of()).stream()
                .map(users::get)
                .filter(Objects::nonNull)
                .sorted(Comparator.comparing(UserProfile::name))
                .toList();
    }

    public FeedPost createPost(long authorId, String content) {
        requireUser(authorId);
        String trimmedContent = content == null ? "" : content.trim();
        if (trimmedContent.isEmpty()) {
            throw new IllegalArgumentException("Post content is required.");
        }
        FeedPost post = new FeedPost(postIdSequence.incrementAndGet(), authorId, trimmedContent, Instant.now());
        Deque<FeedPost> posts = postsByUser.computeIfAbsent(authorId, key -> new ArrayDeque<>());
        synchronized (posts) {
            posts.addFirst(post);
            while (posts.size() > maxPostsPerUser) {
                posts.removeLast();
            }
        }
        return post;
    }

    public List<FeedEntry> getFeed(long userId, Integer limit) {
        requireUser(userId);
        int cappedLimit = clampLimit(limit);
        Set<Long> sourceIds = new HashSet<>(following.getOrDefault(userId, Set.of()));
        sourceIds.add(userId);

        List<FeedEntry> entries = new ArrayList<>();
        for (Long sourceId : sourceIds) {
            UserProfile author = users.get(sourceId);
            if (author == null) {
                continue;
            }
            Deque<FeedPost> posts = postsByUser.get(sourceId);
            if (posts == null) {
                continue;
            }
            List<FeedPost> snapshot;
            synchronized (posts) {
                snapshot = new ArrayList<>(posts);
            }
            for (FeedPost post : snapshot) {
                entries.add(new FeedEntry(post, author));
            }
        }

        entries.sort(Comparator.comparing((FeedEntry entry) -> entry.post().createdAt()).reversed());
        if (entries.size() <= cappedLimit) {
            return entries;
        }
        return new ArrayList<>(entries.subList(0, cappedLimit));
    }

    public int getDefaultFeedSize() {
        return defaultFeedSize;
    }

    private int clampLimit(Integer limit) {
        if (limit == null) {
            return defaultFeedSize;
        }
        int normalized = Math.max(1, limit);
        return Math.min(normalized, 500);
    }

    private UserProfile requireUser(long userId) {
        UserProfile user = users.get(userId);
        if (user == null) {
            throw new IllegalArgumentException("User not found: " + userId);
        }
        return user;
    }

    private void seed() {
        if (!users.isEmpty()) {
            return;
        }
        UserProfile ava = createUser("Ava");
        UserProfile dev = createUser("Dev");
        UserProfile priya = createUser("Priya");
        follow(ava.id(), dev.id());
        follow(ava.id(), priya.id());
        follow(dev.id(), priya.id());
        createPost(ava.id(), "Wrapped the new launch deck. Feedback welcome.");
        createPost(dev.id(), "Service latency down 18% after cache tweaks.");
        createPost(priya.id(), "Content calendar draft is ready for review.");
    }
}
