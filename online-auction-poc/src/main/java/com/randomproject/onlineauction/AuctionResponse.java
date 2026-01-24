package com.randomproject.onlineauction;

import java.math.BigDecimal;
import java.time.Instant;

public record AuctionResponse(String id,
                              String title,
                              String description,
                              String seller,
                              BigDecimal startingPrice,
                              BigDecimal reservePrice,
                              AuctionStatus status,
                              Instant createdAt,
                              Instant endsAt,
                              Instant updatedAt,
                              BigDecimal currentPrice,
                              String highestBidder,
                              BigDecimal highestBidAmount,
                              int bidCount,
                              boolean reserveMet) {
}
