package com.randomproject.strava;

public class ActivitySummary {
    private final int activityCount;
    private final double totalDistanceKm;
    private final int totalDurationMinutes;
    private final double averagePaceMinutesPerKm;

    public ActivitySummary(int activityCount,
                           double totalDistanceKm,
                           int totalDurationMinutes,
                           double averagePaceMinutesPerKm) {
        this.activityCount = activityCount;
        this.totalDistanceKm = totalDistanceKm;
        this.totalDurationMinutes = totalDurationMinutes;
        this.averagePaceMinutesPerKm = averagePaceMinutesPerKm;
    }

    public int getActivityCount() {
        return activityCount;
    }

    public double getTotalDistanceKm() {
        return totalDistanceKm;
    }

    public int getTotalDurationMinutes() {
        return totalDurationMinutes;
    }

    public double getAveragePaceMinutesPerKm() {
        return averagePaceMinutesPerKm;
    }
}
