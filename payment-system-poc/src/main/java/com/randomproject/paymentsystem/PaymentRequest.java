package com.randomproject.paymentsystem;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;

public record PaymentRequest(
        @NotBlank String merchantId,
        @NotBlank String customerId,
        @NotNull @DecimalMin("0.01") BigDecimal amount,
        @NotBlank String currency,
        @NotBlank String paymentMethod,
        String idempotencyKey,
        Boolean captureNow,
        Boolean simulateFailure
) {
}
