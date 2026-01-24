package com.randomproject.onlineauction;

import java.math.BigDecimal;

public record BidCreateRequest(String bidder, BigDecimal amount) {
}
