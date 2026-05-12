package com.randomproject.transactionaloutbox;

import java.time.Instant;

public record OrderView(
        String id,
        String customerId,
        String sku,
        int quantity,
        OrderStatus status,
        Instant createdAt,
        Instant updatedAt
) {
}
