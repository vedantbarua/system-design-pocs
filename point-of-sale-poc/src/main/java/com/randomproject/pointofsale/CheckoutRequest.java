package com.randomproject.pointofsale;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;

public record CheckoutRequest(
        @NotBlank
        @Size(max = 40)
        String paymentMethod,
        @NotNull
        @DecimalMin("0.01")
        BigDecimal amountTendered
) {
}
