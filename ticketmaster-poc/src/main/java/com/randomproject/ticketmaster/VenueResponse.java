package com.randomproject.ticketmaster;

public record VenueResponse(String id,
                            String name,
                            String city,
                            String state,
                            int capacity) {
}
