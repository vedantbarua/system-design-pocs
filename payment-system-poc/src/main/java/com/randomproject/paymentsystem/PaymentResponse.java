package com.randomproject.paymentsystem;

import java.math.BigDecimal;
import java.time.LocalDateTime;

public record PaymentResponse(
        String id,
        String merchantId,
        String customerId,
        BigDecimal amount,
        String currency,
        String paymentMethod,
        PaymentStatus status,
        String failureReason,
        String idempotencyKey,
        LocalDateTime createdAt,
        LocalDateTime authorizedAt,
        LocalDateTime capturedAt,
        LocalDateTime refundedAt,
        boolean idempotent
) {
    public static PaymentResponse from(Payment payment, boolean idempotent) {
        return new PaymentResponse(
                payment.getId(),
                payment.getMerchantId(),
                payment.getCustomerId(),
                payment.getAmount(),
                payment.getCurrency(),
                payment.getPaymentMethod(),
                payment.getStatus(),
                payment.getFailureReason(),
                payment.getIdempotencyKey(),
                payment.getCreatedAt(),
                payment.getAuthorizedAt(),
                payment.getCapturedAt(),
                payment.getRefundedAt(),
                idempotent
        );
    }
}
