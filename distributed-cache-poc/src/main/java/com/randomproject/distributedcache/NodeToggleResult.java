package com.randomproject.distributedcache;

public record NodeToggleResult(
        String nodeId,
        boolean active,
        int affectedKeys,
        int restoredCopies) {
}
