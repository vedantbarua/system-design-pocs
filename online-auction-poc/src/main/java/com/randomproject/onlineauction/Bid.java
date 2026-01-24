package com.randomproject.onlineauction;

import java.math.BigDecimal;
import java.time.Instant;

public class Bid {
    private final String bidder;
    private final BigDecimal amount;
    private final Instant placedAt;

    public Bid(String bidder, BigDecimal amount, Instant placedAt) {
        this.bidder = bidder;
        this.amount = amount;
        this.placedAt = placedAt;
    }

    public String getBidder() {
        return bidder;
    }

    public BigDecimal getAmount() {
        return amount;
    }

    public Instant getPlacedAt() {
        return placedAt;
    }
}
