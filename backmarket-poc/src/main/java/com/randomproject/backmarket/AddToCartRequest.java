package com.randomproject.backmarket;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

public record AddToCartRequest(
        @NotNull Long productId,
        @Min(1) int quantity
) {
}
