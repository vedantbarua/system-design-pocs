package com.randomproject.netflix;

import java.util.List;

public record RecommendationResponse(
        int rank,
        String id,
        String title,
        CatalogType type,
        List<String> genres,
        int year,
        double score,
        String reason
) {
}
