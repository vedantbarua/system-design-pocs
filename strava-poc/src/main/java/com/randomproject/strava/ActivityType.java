package com.randomproject.strava;

public enum ActivityType {
    RUN("Run"),
    RIDE("Ride"),
    SWIM("Swim"),
    HIKE("Hike"),
    WALK("Walk");

    private final String label;

    ActivityType(String label) {
        this.label = label;
    }

    public String getLabel() {
        return label;
    }
}
