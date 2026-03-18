package com.randomproject.distributedcache;

import java.util.List;

public record CacheNodeView(
        String nodeId,
        boolean active,
        int primaryKeys,
        int replicaKeys,
        int orphanKeys,
        int totalKeys,
        int capacity,
        long hitsServed,
        long writesHandled,
        long evictions,
        long lastReplicationLagMillis,
        List<CacheNodeEntryView> entries) {
}
