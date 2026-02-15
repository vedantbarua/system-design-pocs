package com.randomproject.onlineshopping;

public record Product(
        long id,
        String name,
        String category,
        String description,
        double price,
        double rating,
        int reviewCount,
        int stock,
        boolean primeEligible,
        String imageUrl
) {
}
