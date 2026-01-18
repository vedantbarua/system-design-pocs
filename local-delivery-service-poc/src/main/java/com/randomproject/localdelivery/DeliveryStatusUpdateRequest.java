package com.randomproject.localdelivery;

import jakarta.validation.constraints.NotNull;

public record DeliveryStatusUpdateRequest(
        @NotNull
        DeliveryStatus status
) {
}
