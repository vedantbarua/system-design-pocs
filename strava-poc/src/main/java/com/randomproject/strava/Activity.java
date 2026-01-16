package com.randomproject.strava;

import java.time.LocalDateTime;

public class Activity {
    private final long id;
    private final String athleteName;
    private final ActivityType type;
    private final double distanceKm;
    private final int durationMinutes;
    private final LocalDateTime startedAt;
    private final String location;
    private final String description;

    public Activity(long id,
                    String athleteName,
                    ActivityType type,
                    double distanceKm,
                    int durationMinutes,
                    LocalDateTime startedAt,
                    String location,
                    String description) {
        this.id = id;
        this.athleteName = athleteName;
        this.type = type;
        this.distanceKm = distanceKm;
        this.durationMinutes = durationMinutes;
        this.startedAt = startedAt;
        this.location = location;
        this.description = description;
    }

    public long getId() {
        return id;
    }

    public String getAthleteName() {
        return athleteName;
    }

    public ActivityType getType() {
        return type;
    }

    public double getDistanceKm() {
        return distanceKm;
    }

    public int getDurationMinutes() {
        return durationMinutes;
    }

    public LocalDateTime getStartedAt() {
        return startedAt;
    }

    public String getLocation() {
        return location;
    }

    public String getDescription() {
        return description;
    }

    public double getPaceMinutesPerKm() {
        if (distanceKm <= 0) {
            return 0;
        }
        return durationMinutes / distanceKm;
    }
}
