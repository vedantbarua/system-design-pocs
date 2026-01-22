package com.randomproject.googledocs;

import java.time.Instant;

public record DocumentEntry(
        String id,
        String title,
        String content,
        String owner,
        String lastEditor,
        int version,
        Instant createdAt,
        Instant updatedAt
) {
}
