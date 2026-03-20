package com.randomproject.tradinglog;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;

public record PriceUpdateRequest(
        @NotBlank String symbol,
        @NotNull @DecimalMin("0.01") BigDecimal marketPrice
) {
}
