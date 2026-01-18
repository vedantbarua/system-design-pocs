package com.randomproject.localdelivery;

import java.time.Instant;

public record DeliveryOrderResponse(
        String id,
        String customerName,
        String pickupAddress,
        String dropoffAddress,
        String zone,
        PackageSize size,
        DeliveryPriority priority,
        DeliveryStatus status,
        String driverId,
        Integer etaMinutes,
        Instant createdAt,
        Instant updatedAt
) {
}
