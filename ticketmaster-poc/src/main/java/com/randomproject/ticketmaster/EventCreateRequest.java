package com.randomproject.ticketmaster;

import java.time.LocalDateTime;

public record EventCreateRequest(String id,
                                 String name,
                                 String category,
                                 String venueId,
                                 LocalDateTime startsAt,
                                 String headliner,
                                 String description) {
}
