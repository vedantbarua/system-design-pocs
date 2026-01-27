package com.randomproject.netflix;

import java.time.Instant;
import java.util.List;

public record ProfileResponse(
        String id,
        String name,
        List<String> favoriteGenres,
        String maturityLimit,
        Instant createdAt
) {
}
