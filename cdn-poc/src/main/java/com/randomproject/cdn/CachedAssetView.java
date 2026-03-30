package com.randomproject.cdn;

import java.time.Instant;

public record CachedAssetView(
        String edgeId,
        String region,
        String path,
        int version,
        Instant cachedAt,
        Instant expiresAt,
        long hitCount
) {
}
