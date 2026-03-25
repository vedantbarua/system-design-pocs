package com.randomproject.cdn;

public record CdnDefaults(
        int edgeCapacity,
        int defaultTtlSeconds,
        int maxAssetSize) {
}
