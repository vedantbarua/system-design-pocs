package com.randomproject.ticketmaster;

import java.time.Instant;

public class Venue {
    private final String id;
    private final String name;
    private final String city;
    private final String state;
    private final int capacity;
    private final Instant createdAt;
    private final Instant updatedAt;

    public Venue(String id,
                 String name,
                 String city,
                 String state,
                 int capacity,
                 Instant createdAt,
                 Instant updatedAt) {
        this.id = id;
        this.name = name;
        this.city = city;
        this.state = state;
        this.capacity = capacity;
        this.createdAt = createdAt;
        this.updatedAt = updatedAt;
    }

    public String getId() {
        return id;
    }

    public String getName() {
        return name;
    }

    public String getCity() {
        return city;
    }

    public String getState() {
        return state;
    }

    public int getCapacity() {
        return capacity;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }
}
