package com.randomproject.distributedcache;

import java.time.Instant;

public record CacheNodeEntryView(
        String key,
        String value,
        long version,
        String role,
        boolean stale,
        long hitCount,
        Instant writtenAt,
        Instant expiresAt) {
}
