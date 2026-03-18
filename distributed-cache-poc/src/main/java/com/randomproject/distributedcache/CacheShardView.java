package com.randomproject.distributedcache;

import java.util.List;

public record CacheShardView(
        String partitionKey,
        String hash,
        String preferredPrimary,
        String activePrimary,
        List<String> replicaNodes) {
}
