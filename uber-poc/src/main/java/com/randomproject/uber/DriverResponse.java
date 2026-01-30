package com.randomproject.uber;

import java.time.Instant;

public record DriverResponse(
        String id,
        String name,
        String vehicle,
        double rating,
        DriverStatus status,
        String currentZone,
        int completedTrips,
        String activeTripId,
        Instant createdAt,
        Instant updatedAt
) {
}
