package com.randomproject.onlineauction;

import java.math.BigDecimal;

public record AuctionSummary(int totalAuctions,
                             int openAuctions,
                             int closedAuctions,
                             int totalBids,
                             BigDecimal totalVolume) {
}
