package com.randomproject.searchengine;

import java.util.List;

public record SearchResponse(
        String query,
        List<String> normalizedTerms,
        long tookMillis,
        int totalHits,
        List<SearchHit> results,
        List<SearchShardStats> shardStats
) {
}
