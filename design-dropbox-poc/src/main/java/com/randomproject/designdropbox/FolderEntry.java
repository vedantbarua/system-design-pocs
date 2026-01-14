package com.randomproject.designdropbox;

import java.time.Instant;

public record FolderEntry(
        String id,
        String name,
        String parentId,
        Instant createdAt
) {
}
