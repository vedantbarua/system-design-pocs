package com.randomproject.searchengine;

public record SearchShardStats(
        int shardId,
        int candidateCount,
        int matchedCount
) {
}
