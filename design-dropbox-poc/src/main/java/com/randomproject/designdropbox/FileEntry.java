package com.randomproject.designdropbox;

import java.time.Instant;

public record FileEntry(
        String id,
        String name,
        String parentId,
        int size,
        String content,
        Instant createdAt,
        Instant updatedAt
) {
}
