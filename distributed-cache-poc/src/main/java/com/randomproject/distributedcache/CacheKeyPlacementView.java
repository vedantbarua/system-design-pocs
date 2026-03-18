package com.randomproject.distributedcache;

import java.time.Instant;
import java.util.List;

public record CacheKeyPlacementView(
        String key,
        String value,
        long version,
        Instant writtenAt,
        Instant expiresAt,
        long remainingTtlSeconds,
        long hitCount,
        String preferredPrimary,
        String activePrimary,
        List<String> replicaNodes,
        int activeCopies,
        boolean failoverActive) {
}
