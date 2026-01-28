package com.randomproject.ticketmaster;

import java.math.BigDecimal;

public record TierCreateRequest(String id,
                                String name,
                                BigDecimal price,
                                Integer capacity) {
}
