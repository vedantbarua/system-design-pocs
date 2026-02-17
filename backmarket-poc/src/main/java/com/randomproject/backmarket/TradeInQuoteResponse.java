package com.randomproject.backmarket;

import java.time.Instant;

public record TradeInQuoteResponse(
        String quoteId,
        double offerAmount,
        double estimatedPayout,
        String condition,
        String inspectionNotes,
        Instant expiresAt
) {
}
