package com.randomproject.uniqueidgenerator;

import java.time.Instant;

public record NodeSnapshot(
        int nodeId,
        long lastTimestamp,
        Instant lastTimestampInstant,
        int lastSequence,
        long generatedCount
) {
}
