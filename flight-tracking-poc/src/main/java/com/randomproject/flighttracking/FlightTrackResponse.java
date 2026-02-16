package com.randomproject.flighttracking;

import java.time.Instant;
import java.util.List;

public record FlightTrackResponse(
        long flightId,
        String flightNumber,
        String status,
        double progress,
        Instant lastUpdated,
        Position currentPosition,
        List<Position> path,
        double distanceTotalMiles,
        double distanceRemainingMiles,
        Instant estimatedArrival
) {
}
