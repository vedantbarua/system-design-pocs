package com.randomproject.facebooknewsfeed;

import java.time.Instant;

public record FeedPost(long id, long authorId, String content, Instant createdAt) {
}
