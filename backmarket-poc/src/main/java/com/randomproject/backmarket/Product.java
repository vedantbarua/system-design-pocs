package com.randomproject.backmarket;

public record Product(
        long id,
        String name,
        String category,
        String description,
        double price,
        double originalPrice,
        String conditionGrade,
        int warrantyMonths,
        String sellerName,
        double ecoSavingsKg,
        double rating,
        int reviewCount,
        int stock,
        String imageUrl
) {
}
