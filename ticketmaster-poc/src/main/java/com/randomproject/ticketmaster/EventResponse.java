package com.randomproject.ticketmaster;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDateTime;

public record EventResponse(String id,
                            String name,
                            EventCategory category,
                            String venueId,
                            String venueName,
                            LocalDateTime startsAt,
                            EventStatus status,
                            int totalCapacity,
                            int totalAvailable,
                            BigDecimal minPrice,
                            BigDecimal maxPrice,
                            String headliner,
                            String description,
                            Instant createdAt,
                            Instant updatedAt) {
}
