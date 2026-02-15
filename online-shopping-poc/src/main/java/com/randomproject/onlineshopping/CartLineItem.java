package com.randomproject.onlineshopping;

public record CartLineItem(
        long productId,
        String name,
        String imageUrl,
        double price,
        int quantity,
        double lineTotal
) {
}
