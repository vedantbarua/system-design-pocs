package com.randomproject.googledocs;

import java.time.Instant;

public record CommentEntry(
        String id,
        String author,
        String message,
        boolean resolved,
        Instant createdAt
) {
}
