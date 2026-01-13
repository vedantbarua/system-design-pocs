package com.randomproject.pricetracker;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;

public record PriceTrackRequest(
        @NotBlank
        @Size(max = 64)
        @Pattern(regexp = "^[A-Za-z0-9._:-]+$")
        String id,
        @NotBlank
        @Size(max = 120)
        String name,
        @Size(max = 300)
        String url,
        @NotNull
        @DecimalMin("0.01")
        BigDecimal targetPrice,
        @NotNull
        @DecimalMin("0.01")
        BigDecimal currentPrice
) {
}
