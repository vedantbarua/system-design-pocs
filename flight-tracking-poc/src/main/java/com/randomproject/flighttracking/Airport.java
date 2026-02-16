package com.randomproject.flighttracking;

public record Airport(
        String code,
        String name,
        String city,
        String country,
        double latitude,
        double longitude,
        String timezone
) {
}
