package com.randomproject.distributedcache;

import java.util.List;

public record ClusterSnapshot(
        CacheConfigSnapshot config,
        int totalNodes,
        int activeNodes,
        int keyCount,
        int keysInFailover,
        List<CacheKeyPlacementView> keys,
        List<CacheShardView> shards,
        List<CacheNodeView> nodes,
        List<ClusterEvent> events) {
}
