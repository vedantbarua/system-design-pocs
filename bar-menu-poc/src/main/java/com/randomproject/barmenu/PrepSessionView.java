package com.randomproject.barmenu;

import java.time.Instant;

public record PrepSessionView(
        String id,
        String drinkId,
        String drinkName,
        PrepStatus status,
        int currentStepNumber,
        int totalSteps,
        int completedSteps,
        int progressPercent,
        RecipeStep currentStep,
        Instant startedAt,
        Instant updatedAt) {
}
