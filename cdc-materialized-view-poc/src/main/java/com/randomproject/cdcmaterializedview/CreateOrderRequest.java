package com.randomproject.cdcmaterializedview;

import java.math.BigDecimal;

public record CreateOrderRequest(String customerId, String sku, Integer quantity, BigDecimal unitPrice) {
}
