package com.randomproject.workouttracker;

public record CalorieOverview(
        int workoutCount,
        int mealCount,
        int totalWorkoutMinutes,
        int caloriesBurned,
        int caloriesConsumed,
        int netCalories
) {
}
