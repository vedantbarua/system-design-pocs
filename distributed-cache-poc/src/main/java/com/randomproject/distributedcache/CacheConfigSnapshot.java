package com.randomproject.distributedcache;

import java.util.List;

public record CacheConfigSnapshot(
        int virtualNodes,
        int replicationFactor,
        int nodeCapacity,
        int defaultTtlSeconds,
        int maxTtlSeconds,
        List<String> nodes) {
}
