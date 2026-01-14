package com.randomproject.designdropbox;

import java.time.Instant;

public record ShareLink(
        String token,
        String fileId,
        Instant createdAt,
        Instant expiresAt
) {
}
