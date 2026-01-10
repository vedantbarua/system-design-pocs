package com.randomproject.uniqueidgenerator;

import java.time.Instant;

public record IdDecodeResult(
        long id,
        int nodeId,
        int sequence,
        long timestamp,
        Instant timestampInstant,
        long epochMillis
) {
}
