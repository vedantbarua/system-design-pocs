package com.randomproject.uniqueidgenerator;

import java.time.Instant;

public record IdDecodeResult(
        long id,
        int nodeId,
        int sequence,
        long relativeTimestamp,
        long timestamp,
        Instant timestampInstant,
        long epochMillis,
        IdBitLayout bitLayout
) {
}
