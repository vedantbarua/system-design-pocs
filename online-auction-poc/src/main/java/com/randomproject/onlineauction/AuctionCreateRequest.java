package com.randomproject.onlineauction;

import java.math.BigDecimal;

public record AuctionCreateRequest(String id,
                                   String title,
                                   String description,
                                   String seller,
                                   BigDecimal startingPrice,
                                   BigDecimal reservePrice,
                                   Integer durationMinutes) {
}
