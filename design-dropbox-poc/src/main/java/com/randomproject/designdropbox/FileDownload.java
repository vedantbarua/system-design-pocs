package com.randomproject.designdropbox;

import java.time.Instant;

public record FileDownload(
        String fileId,
        String name,
        String content,
        int size,
        Instant createdAt,
        Instant updatedAt
) {
}
