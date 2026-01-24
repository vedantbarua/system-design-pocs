package com.randomproject.onlineauction;

import java.math.BigDecimal;
import java.time.Instant;

public record BidResponse(String bidder, BigDecimal amount, Instant placedAt) {
}
