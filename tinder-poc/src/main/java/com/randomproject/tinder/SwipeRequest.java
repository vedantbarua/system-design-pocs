package com.randomproject.tinder;

import jakarta.validation.constraints.NotNull;

public record SwipeRequest(@NotNull Long profileId, @NotNull SwipeDecision decision) {
}
