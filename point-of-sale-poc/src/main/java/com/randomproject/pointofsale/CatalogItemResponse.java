package com.randomproject.pointofsale;

import java.math.BigDecimal;
import java.time.Instant;

public record CatalogItemResponse(
        String id,
        String name,
        String category,
        BigDecimal price,
        Instant createdAt,
        Instant updatedAt
) {
}
