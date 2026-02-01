package com.randomproject.adclickaggregator;

import java.time.Instant;

public record TimeSeriesPoint(
        String groupKey,
        Instant bucketStart,
        long clicks,
        long spendCents
) {
}
