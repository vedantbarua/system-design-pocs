package com.randomproject.pricetracker;

import java.math.BigDecimal;
import java.time.Instant;

public class PriceTrackerItem {
    private final String id;
    private final String name;
    private final String url;
    private final BigDecimal targetPrice;
    private final BigDecimal currentPrice;
    private final Instant createdAt;
    private final Instant updatedAt;

    public PriceTrackerItem(String id,
                            String name,
                            String url,
                            BigDecimal targetPrice,
                            BigDecimal currentPrice,
                            Instant createdAt,
                            Instant updatedAt) {
        this.id = id;
        this.name = name;
        this.url = url;
        this.targetPrice = targetPrice;
        this.currentPrice = currentPrice;
        this.createdAt = createdAt;
        this.updatedAt = updatedAt;
    }

    public String getId() {
        return id;
    }

    public String getName() {
        return name;
    }

    public String getUrl() {
        return url;
    }

    public BigDecimal getTargetPrice() {
        return targetPrice;
    }

    public BigDecimal getCurrentPrice() {
        return currentPrice;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public boolean isBelowTarget() {
        return currentPrice.compareTo(targetPrice) <= 0;
    }
}
