package com.randomproject.transactionaloutbox;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;

public record CreateOrderRequest(
        @NotBlank String customerId,
        @NotBlank String sku,
        @Min(1) int quantity,
        boolean poisonEvent
) {
}
