package com.randomproject.pricetracker;

import java.math.BigDecimal;
import java.time.Instant;

public record PriceTrackerResponse(
        String id,
        String name,
        String url,
        BigDecimal targetPrice,
        BigDecimal currentPrice,
        Instant createdAt,
        Instant updatedAt,
        boolean belowTarget
) {
}
