package com.randomproject.paymentsystem;

public record PaymentActionResult(
        Payment payment,
        boolean changed,
        String message
) {
}
