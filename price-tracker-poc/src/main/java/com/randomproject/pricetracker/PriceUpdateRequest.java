package com.randomproject.pricetracker;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;

public record PriceUpdateRequest(
        @NotNull
        @DecimalMin("0.01")
        BigDecimal currentPrice
) {
}
