package com.randomproject.cdcmaterializedview;

import java.math.BigDecimal;

public record UpdateOrderRequest(String sku, Integer quantity, BigDecimal unitPrice, OrderStatus status) {
}
