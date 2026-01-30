package com.randomproject.uber;

public record UberMetricsResponse(
        int totalRiders,
        int totalDrivers,
        int availableDrivers,
        int onTripDrivers,
        int totalTrips,
        int activeTrips,
        int requestedTrips
) {
}
