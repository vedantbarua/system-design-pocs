package com.randomproject.cdcmaterializedview;

import java.math.BigDecimal;

public record OrderView(
        String orderId,
        String customerId,
        String sku,
        int quantity,
        BigDecimal unitPrice,
        BigDecimal total,
        OrderStatus status,
        long rowVersion,
        boolean deleted) {
}
