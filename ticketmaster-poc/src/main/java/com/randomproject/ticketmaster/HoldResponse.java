package com.randomproject.ticketmaster;

import java.time.Instant;

public record HoldResponse(String id,
                           String eventId,
                           String tierId,
                           String customer,
                           int quantity,
                           HoldStatus status,
                           Instant createdAt,
                           Instant expiresAt,
                           Instant updatedAt) {
}
