package com.randomproject.workouttracker;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;

public record WorkoutIngestRequest(
        @NotBlank String name,
        @NotBlank String category,
        @Min(1) int durationMinutes,
        @Min(0) int caloriesBurned,
        String occurredAt
) {
}
