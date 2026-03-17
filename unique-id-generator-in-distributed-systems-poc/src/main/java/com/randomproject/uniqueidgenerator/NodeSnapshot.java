package com.randomproject.uniqueidgenerator;

import java.time.Instant;

public record NodeSnapshot(
        int nodeId,
        long lastTimestamp,
        Instant lastTimestampInstant,
        long lastObservedTimestamp,
        Instant lastObservedTimestampInstant,
        int lastSequence,
        long generatedCount,
        long clockRegressionEvents,
        long lastDriftMillis
) {
}
