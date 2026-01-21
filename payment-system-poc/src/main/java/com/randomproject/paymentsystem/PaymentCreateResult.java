package com.randomproject.paymentsystem;

public record PaymentCreateResult(
        Payment payment,
        boolean idempotent,
        String message
) {
}
