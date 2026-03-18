package com.randomproject.distributedcache;

import java.time.Instant;
import java.util.List;

public record CacheReadResult(
        String key,
        String value,
        long version,
        Instant writtenAt,
        Instant expiresAt,
        long remainingTtlSeconds,
        String servedByNode,
        String preferredPrimary,
        String activePrimary,
        List<String> replicaNodes,
        boolean failoverActive) {
}
