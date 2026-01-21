package com.randomproject.paymentsystem;

import java.math.BigDecimal;

public record PaymentStats(
        int totalPayments,
        int authorizedCount,
        int capturedCount,
        int refundedCount,
        int failedCount,
        BigDecimal authorizedAmount,
        BigDecimal capturedAmount,
        BigDecimal refundedAmount
) {
}
