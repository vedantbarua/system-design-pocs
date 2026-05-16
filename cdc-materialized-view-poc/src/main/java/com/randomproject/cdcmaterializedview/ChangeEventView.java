package com.randomproject.cdcmaterializedview;

import java.math.BigDecimal;

public record ChangeEventView(
        long sequence,
        ChangeOperation operation,
        String orderId,
        String customerId,
        String sku,
        int quantity,
        BigDecimal total,
        OrderStatus status,
        long rowVersion,
        boolean duplicate,
        String source) {
}
