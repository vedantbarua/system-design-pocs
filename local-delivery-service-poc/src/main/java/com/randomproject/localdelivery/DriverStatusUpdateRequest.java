package com.randomproject.localdelivery;

import jakarta.validation.constraints.NotNull;

public record DriverStatusUpdateRequest(
        @NotNull
        DriverStatus status
) {
}
