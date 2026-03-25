package com.randomproject.cdn;

public record InvalidationResult(
        String mode,
        String matcher,
        int invalidatedEdges,
        int invalidatedEntries) {
}
