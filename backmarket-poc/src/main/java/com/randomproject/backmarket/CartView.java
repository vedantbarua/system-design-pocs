package com.randomproject.backmarket;

import java.util.List;

public record CartView(
        List<CartLineItem> items,
        int itemCount,
        PricingSummary pricing
) {
}
