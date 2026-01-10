package com.randomproject.uniqueidgenerator;

import java.time.Instant;

public record IdConfigSnapshot(
        long epochMillis,
        Instant epochInstant,
        int nodeBits,
        int sequenceBits,
        int maxNodeId,
        int maxSequence,
        int defaultNodeId,
        int maxBatch
) {
}
