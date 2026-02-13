package com.randomproject.workouttracker;

import java.time.Instant;

public record WorkoutEntry(
        long id,
        String name,
        String category,
        int durationMinutes,
        int caloriesBurned,
        Instant occurredAt
) {
}
