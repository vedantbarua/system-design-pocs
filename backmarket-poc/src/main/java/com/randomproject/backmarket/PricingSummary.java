package com.randomproject.backmarket;

public record PricingSummary(
        double subtotal,
        double shipping,
        double tax,
        double total
) {
}
