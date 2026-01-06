package com.randomproject.keyvaluestore;

import java.time.Instant;

public record KeyValueResponse(
        String key,
        String value,
        Instant createdAt,
        Instant updatedAt,
        Instant expiresAt
) {
}
