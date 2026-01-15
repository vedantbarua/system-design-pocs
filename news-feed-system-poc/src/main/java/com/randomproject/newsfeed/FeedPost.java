package com.randomproject.newsfeed;

import java.time.Instant;

public record FeedPost(long id, long authorId, String content, Instant createdAt) {
}
