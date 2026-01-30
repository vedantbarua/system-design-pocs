package com.randomproject.uber;

import java.time.Instant;

public record TripResponse(
        String id,
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
        Instant updatedAt
) {
}
