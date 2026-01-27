package com.randomproject.netflix;

public record RecommendationEntry(CatalogItem item, double score, int genreMatches) {
}
