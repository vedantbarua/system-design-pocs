package com.randomproject.pointofsale;

import java.math.BigDecimal;
import java.time.Instant;

public class CatalogItem {
    private final String id;
    private final String name;
    private final String category;
    private final BigDecimal price;
    private final Instant createdAt;
    private final Instant updatedAt;

    public CatalogItem(String id, String name, String category, BigDecimal price, Instant createdAt, Instant updatedAt) {
        this.id = id;
        this.name = name;
        this.category = category;
        this.price = price;
        this.createdAt = createdAt;
        this.updatedAt = updatedAt;
    }

    public String getId() {
        return id;
    }

    public String getName() {
        return name;
    }

    public String getCategory() {
        return category;
    }

    public BigDecimal getPrice() {
        return price;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }
}
