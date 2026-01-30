package com.randomproject.uber;

import java.time.Instant;

public class Trip {
    private final String id;
    private final String riderId;
    private final String driverId;
    private final String pickupAddress;
    private final String dropoffAddress;
    private final String zone;
    private final RideProduct product;
    private final TripStatus status;
    private final double distanceKm;
    private final double surgeMultiplier;
    private final double estimatedFare;
    private final Instant requestedAt;
    private final Instant updatedAt;

    public Trip(String id,
                String riderId,
                String driverId,
                String pickupAddress,
                String dropoffAddress,
                String zone,
                RideProduct product,
                TripStatus status,
                double distanceKm,
                double surgeMultiplier,
                double estimatedFare,
                Instant requestedAt,
                Instant updatedAt) {
        this.id = id;
        this.riderId = riderId;
        this.driverId = driverId;
        this.pickupAddress = pickupAddress;
        this.dropoffAddress = dropoffAddress;
        this.zone = zone;
        this.product = product;
        this.status = status;
        this.distanceKm = distanceKm;
        this.surgeMultiplier = surgeMultiplier;
        this.estimatedFare = estimatedFare;
        this.requestedAt = requestedAt;
        this.updatedAt = updatedAt;
    }

    public String getId() {
        return id;
    }

    public String getRiderId() {
        return riderId;
    }

    public String getDriverId() {
        return driverId;
    }

    public String getPickupAddress() {
        return pickupAddress;
    }

    public String getDropoffAddress() {
        return dropoffAddress;
    }

    public String getZone() {
        return zone;
    }

    public RideProduct getProduct() {
        return product;
    }

    public TripStatus getStatus() {
        return status;
    }

    public double getDistanceKm() {
        return distanceKm;
    }

    public double getSurgeMultiplier() {
        return surgeMultiplier;
    }

    public double getEstimatedFare() {
        return estimatedFare;
    }

    public Instant getRequestedAt() {
        return requestedAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public boolean isActive() {
        return status != TripStatus.COMPLETED && status != TripStatus.CANCELED;
    }
}
