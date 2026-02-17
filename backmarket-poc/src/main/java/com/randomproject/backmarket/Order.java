package com.randomproject.backmarket;

import java.time.Instant;
import java.util.List;

public record Order(
        long id,
        List<CartLineItem> items,
        PricingSummary pricing,
        String status,
        String shippingSpeed,
        Instant createdAt,
        Instant estimatedDelivery
) {
}
