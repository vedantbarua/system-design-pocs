package com.randomproject.backmarket;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;

public record TradeInQuoteRequest(
        @NotBlank String deviceType,
        @NotBlank String brand,
        @NotBlank String model,
        @NotBlank String condition,
        @Min(64) @Max(1024) int storageGb
) {
}
