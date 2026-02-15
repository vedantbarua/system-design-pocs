package com.randomproject.onlineshopping;

import java.util.List;

public record CartView(
        List<CartLineItem> items,
        int itemCount,
        PricingSummary pricing
) {
}
