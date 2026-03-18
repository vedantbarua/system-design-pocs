package com.randomproject.distributedcache;

public record MovedKeyView(
        String key,
        String currentPrimary,
        String projectedPrimary) {
}
