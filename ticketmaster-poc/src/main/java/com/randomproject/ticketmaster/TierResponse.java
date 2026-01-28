package com.randomproject.ticketmaster;

import java.math.BigDecimal;

public record TierResponse(String id,
                           String eventId,
                           String name,
                           BigDecimal price,
                           int capacity,
                           int soldCount,
                           int heldCount,
                           int available) {
}
