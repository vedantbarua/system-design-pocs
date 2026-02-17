package com.randomproject.backmarket;

public record CartLineItem(
        long productId,
        String name,
        String imageUrl,
        double price,
        String conditionGrade,
        int warrantyMonths,
        String sellerName,
        int quantity,
        double lineTotal
) {
}
