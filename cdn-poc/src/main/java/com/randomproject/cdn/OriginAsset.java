package com.randomproject.cdn;

import java.time.Instant;

public record OriginAsset(
        String id,
        String path,
        String content,
        int cacheTtlSeconds,
        int version,
        Instant updatedAt) {
}
