package com.randomproject.flighttracking;

import java.time.Instant;

public record Position(
        double latitude,
        double longitude,
        int altitudeFeet,
        int speedKts,
        int heading,
        Instant timestamp
) {
}
