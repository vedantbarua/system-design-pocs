package com.randomproject.netflix;

import java.time.Instant;
import java.util.List;

public record CatalogResponse(
        String id,
        String title,
        CatalogType type,
        int year,
        int durationMinutes,
        String maturityRating,
        List<String> genres,
        String description,
        int popularity,
        long plays,
        Instant createdAt,
        Instant updatedAt
) {
}
