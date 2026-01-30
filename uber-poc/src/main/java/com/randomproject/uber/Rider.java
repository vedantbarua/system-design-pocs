package com.randomproject.uber;

import java.time.Instant;

public class Rider {
    private final String id;
    private final String name;
    private final double rating;
    private final String homeZone;
    private final Instant createdAt;
    private final Instant updatedAt;

    public Rider(String id, String name, double rating, String homeZone, Instant createdAt, Instant updatedAt) {
        this.id = id;
        this.name = name;
        this.rating = rating;
        this.homeZone = homeZone;
        this.createdAt = createdAt;
        this.updatedAt = updatedAt;
    }

    public String getId() {
        return id;
    }

    public String getName() {
        return name;
    }

    public double getRating() {
        return rating;
    }

    public String getHomeZone() {
        return homeZone;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }
}
