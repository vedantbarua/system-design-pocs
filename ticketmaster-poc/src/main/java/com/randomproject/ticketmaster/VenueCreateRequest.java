package com.randomproject.ticketmaster;

public record VenueCreateRequest(String id,
                                 String name,
                                 String city,
                                 String state,
                                 Integer capacity) {
}
