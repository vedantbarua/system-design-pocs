package com.randomproject.flighttracking;

import java.time.Instant;

public record Flight(
        long id,
        String flightNumber,
        String airline,
        String origin,
        String destination,
        String aircraft,
        String status,
        Instant scheduledDeparture,
        Instant scheduledArrival,
        Instant estimatedDeparture,
        Instant estimatedArrival,
        String gate,
        String terminal
) {
}
