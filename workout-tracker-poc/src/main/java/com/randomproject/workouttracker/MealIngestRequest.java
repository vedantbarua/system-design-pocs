package com.randomproject.workouttracker;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;

public record MealIngestRequest(
        @NotBlank String name,
        @NotBlank String mealType,
        @Min(0) int calories,
        String occurredAt
) {
}
