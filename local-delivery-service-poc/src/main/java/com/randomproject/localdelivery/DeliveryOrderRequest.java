package com.randomproject.localdelivery;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record DeliveryOrderRequest(
        @NotBlank
        @Size(max = 64)
        @Pattern(regexp = "^[A-Za-z0-9._:-]+$")
        String id,
        @NotBlank
        @Size(max = 120)
        String customerName,
        @NotBlank
        @Size(max = 200)
        String pickupAddress,
        @NotBlank
        @Size(max = 200)
        String dropoffAddress,
        @NotBlank
        @Size(max = 60)
        String zone,
        @NotNull
        PackageSize size,
        @NotNull
        DeliveryPriority priority
) {
}
