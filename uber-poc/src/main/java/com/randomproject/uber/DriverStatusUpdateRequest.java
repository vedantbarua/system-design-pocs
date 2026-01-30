package com.randomproject.uber;

import jakarta.validation.constraints.NotNull;

public record DriverStatusUpdateRequest(
        @NotNull
        DriverStatus status
) {
}
