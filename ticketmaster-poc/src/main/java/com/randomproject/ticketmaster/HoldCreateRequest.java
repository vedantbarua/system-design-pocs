package com.randomproject.ticketmaster;

public record HoldCreateRequest(String eventId,
                                String tierId,
                                String customer,
                                Integer quantity) {
}
