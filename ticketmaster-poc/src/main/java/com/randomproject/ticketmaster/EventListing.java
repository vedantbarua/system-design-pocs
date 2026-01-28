package com.randomproject.ticketmaster;

import java.math.BigDecimal;

public class EventListing {
    private final Event event;
    private final Venue venue;
    private final EventStatus status;
    private final int totalCapacity;
    private final int totalSold;
    private final int totalHeld;
    private final int totalAvailable;
    private final BigDecimal minPrice;
    private final BigDecimal maxPrice;

    public EventListing(Event event,
                        Venue venue,
                        EventStatus status,
                        int totalCapacity,
                        int totalSold,
                        int totalHeld,
                        int totalAvailable,
                        BigDecimal minPrice,
                        BigDecimal maxPrice) {
        this.event = event;
        this.venue = venue;
        this.status = status;
        this.totalCapacity = totalCapacity;
        this.totalSold = totalSold;
        this.totalHeld = totalHeld;
        this.totalAvailable = totalAvailable;
        this.minPrice = minPrice;
        this.maxPrice = maxPrice;
    }

    public Event getEvent() {
        return event;
    }

    public Venue getVenue() {
        return venue;
    }

    public EventStatus getStatus() {
        return status;
    }

    public int getTotalCapacity() {
        return totalCapacity;
    }

    public int getTotalSold() {
        return totalSold;
    }

    public int getTotalHeld() {
        return totalHeld;
    }

    public int getTotalAvailable() {
        return totalAvailable;
    }

    public BigDecimal getMinPrice() {
        return minPrice;
    }

    public BigDecimal getMaxPrice() {
        return maxPrice;
    }
}
