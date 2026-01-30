package com.randomproject.uber;

import jakarta.validation.constraints.NotNull;

public record TripStatusUpdateRequest(
        @NotNull
        TripStatus status
) {
}
