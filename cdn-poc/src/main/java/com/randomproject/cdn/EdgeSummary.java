package com.randomproject.cdn;

public record EdgeSummary(
        String edgeId,
        String region,
        int capacity,
        int cachedObjects,
        long hits,
        long misses,
        long originFetches,
        long evictions) {
}
