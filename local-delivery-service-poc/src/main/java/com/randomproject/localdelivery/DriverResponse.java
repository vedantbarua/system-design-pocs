package com.randomproject.localdelivery;

import java.time.Instant;

public record DriverResponse(
        String id,
        String name,
        String vehicleType,
        DriverStatus status,
        int completedDeliveries,
        String activeOrderId,
        Instant createdAt,
        Instant updatedAt
) {
}
