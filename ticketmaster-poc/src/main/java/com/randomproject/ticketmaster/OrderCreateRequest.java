package com.randomproject.ticketmaster;

public record OrderCreateRequest(String eventId,
                                 String tierId,
                                 String customer,
                                 Integer quantity,
                                 String holdId) {
}
