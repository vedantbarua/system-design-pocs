package com.randomproject.localdelivery;

public record DeliveryMetricsResponse(
        int totalOrders,
        int activeOrders,
        int unassignedOrders,
        int availableDrivers,
        int onDeliveryDrivers
) {
}
