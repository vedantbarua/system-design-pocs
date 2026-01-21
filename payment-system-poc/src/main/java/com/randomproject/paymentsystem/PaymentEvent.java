package com.randomproject.paymentsystem;

import java.time.LocalDateTime;

public record PaymentEvent(
        String id,
        String paymentId,
        String type,
        String message,
        LocalDateTime createdAt
) {
}
