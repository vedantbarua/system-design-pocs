package com.randomproject.cdcmaterializedview;

import java.math.BigDecimal;

public record OrderSummaryView(String orderId, String customerId, BigDecimal total, OrderStatus status, long sourceSequence) {
}
