package com.randomproject.tradinglog;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;

public record TradeRequest(
        @NotBlank String symbol,
        @NotNull TradeSide side,
        @Min(1) @Max(1000000) int quantity,
        @NotNull @DecimalMin("0.01") BigDecimal price,
        @NotBlank String trader,
        String venue
) {
}
