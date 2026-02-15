package com.randomproject.onlineshopping;

public record PricingSummary(
        double subtotal,
        double shipping,
        double tax,
        double total
) {
}
