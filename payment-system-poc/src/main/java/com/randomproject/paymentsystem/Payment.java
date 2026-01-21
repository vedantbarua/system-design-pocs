package com.randomproject.paymentsystem;

import java.math.BigDecimal;
import java.time.LocalDateTime;

public class Payment {
    private final String id;
    private final String merchantId;
    private final String customerId;
    private final BigDecimal amount;
    private final String currency;
    private final String paymentMethod;
    private final String idempotencyKey;
    private final LocalDateTime createdAt;
    private PaymentStatus status;
    private LocalDateTime authorizedAt;
    private LocalDateTime capturedAt;
    private LocalDateTime refundedAt;
    private String failureReason;
    private LocalDateTime lastEventAt;

    public Payment(String id,
                   String merchantId,
                   String customerId,
                   BigDecimal amount,
                   String currency,
                   String paymentMethod,
                   String idempotencyKey,
                   PaymentStatus status,
                   LocalDateTime createdAt) {
        this.id = id;
        this.merchantId = merchantId;
        this.customerId = customerId;
        this.amount = amount;
        this.currency = currency;
        this.paymentMethod = paymentMethod;
        this.idempotencyKey = idempotencyKey;
        this.status = status;
        this.createdAt = createdAt;
        this.lastEventAt = createdAt;
    }

    public String getId() {
        return id;
    }

    public String getMerchantId() {
        return merchantId;
    }

    public String getCustomerId() {
        return customerId;
    }

    public BigDecimal getAmount() {
        return amount;
    }

    public String getCurrency() {
        return currency;
    }

    public String getPaymentMethod() {
        return paymentMethod;
    }

    public String getIdempotencyKey() {
        return idempotencyKey;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public PaymentStatus getStatus() {
        return status;
    }

    public LocalDateTime getAuthorizedAt() {
        return authorizedAt;
    }

    public LocalDateTime getCapturedAt() {
        return capturedAt;
    }

    public LocalDateTime getRefundedAt() {
        return refundedAt;
    }

    public String getFailureReason() {
        return failureReason;
    }

    public LocalDateTime getLastEventAt() {
        return lastEventAt;
    }

    public void markAuthorized(LocalDateTime when) {
        status = PaymentStatus.AUTHORIZED;
        authorizedAt = when;
        lastEventAt = when;
    }

    public void markFailed(String reason, LocalDateTime when) {
        status = PaymentStatus.FAILED;
        failureReason = reason;
        lastEventAt = when;
    }

    public void markCaptured(LocalDateTime when) {
        status = PaymentStatus.CAPTURED;
        capturedAt = when;
        lastEventAt = when;
    }

    public void markRefunded(LocalDateTime when) {
        status = PaymentStatus.REFUNDED;
        refundedAt = when;
        lastEventAt = when;
    }
}
