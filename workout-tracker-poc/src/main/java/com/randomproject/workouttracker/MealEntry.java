package com.randomproject.workouttracker;

import java.time.Instant;

public record MealEntry(
        long id,
        String name,
        String mealType,
        int calories,
        Instant occurredAt
) {
}
