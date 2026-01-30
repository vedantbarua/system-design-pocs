package com.randomproject.uber;

import java.time.Instant;

public class Driver {
    private final String id;
    private final String name;
    private final String vehicle;
    private final double rating;
    private final DriverStatus status;
    private final String currentZone;
    private final int completedTrips;
    private final String activeTripId;
    private final Instant createdAt;
    private final Instant updatedAt;

    public Driver(String id,
                  String name,
                  String vehicle,
                  double rating,
                  DriverStatus status,
                  String currentZone,
                  int completedTrips,
                  String activeTripId,
                  Instant createdAt,
                  Instant updatedAt) {
        this.id = id;
        this.name = name;
        this.vehicle = vehicle;
        this.rating = rating;
        this.status = status;
        this.currentZone = currentZone;
        this.completedTrips = completedTrips;
        this.activeTripId = activeTripId;
        this.createdAt = createdAt;
        this.updatedAt = updatedAt;
    }

    public String getId() {
        return id;
    }

    public String getName() {
        return name;
    }

    public String getVehicle() {
        return vehicle;
    }

    public double getRating() {
        return rating;
    }

    public DriverStatus getStatus() {
        return status;
    }

    public String getCurrentZone() {
        return currentZone;
    }

    public int getCompletedTrips() {
        return completedTrips;
    }

    public String getActiveTripId() {
        return activeTripId;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }
}
