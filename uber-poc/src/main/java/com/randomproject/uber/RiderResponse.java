package com.randomproject.uber;

import java.time.Instant;

public record RiderResponse(
        String id,
        String name,
        double rating,
        String homeZone,
        Instant createdAt,
        Instant updatedAt
) {
}
