package com.randomproject.sagaorchestrator;

import java.math.BigDecimal;
import java.time.Instant;

public class SagaMessage {
    private String sagaId;
    private String orderId;
    private String customerId;
    private String sku;
    private int quantity;
    private BigDecimal amount;
    private boolean simulatePaymentFailure;
    private SagaMessageType type;
    private String failureReason;
    private Instant occurredAt;

    public SagaMessage() {
    }

    public SagaMessage(String sagaId,
                       String orderId,
                       String customerId,
                       String sku,
                       int quantity,
                       BigDecimal amount,
                       boolean simulatePaymentFailure,
                       SagaMessageType type,
                       String failureReason,
                       Instant occurredAt) {
        this.sagaId = sagaId;
        this.orderId = orderId;
        this.customerId = customerId;
        this.sku = sku;
        this.quantity = quantity;
        this.amount = amount;
        this.simulatePaymentFailure = simulatePaymentFailure;
        this.type = type;
        this.failureReason = failureReason;
        this.occurredAt = occurredAt;
    }

    public static SagaMessage forSaga(OrderSaga saga, SagaMessageType type, String failureReason) {
        return new SagaMessage(
                saga.getSagaId(),
                saga.getOrderId(),
                saga.getCustomerId(),
                saga.getSku(),
                saga.getQuantity(),
                saga.getAmount(),
                saga.isSimulatePaymentFailure(),
                type,
                failureReason,
                Instant.now()
        );
    }

    public String getSagaId() {
        return sagaId;
    }

    public void setSagaId(String sagaId) {
        this.sagaId = sagaId;
    }

    public String getOrderId() {
        return orderId;
    }

    public void setOrderId(String orderId) {
        this.orderId = orderId;
    }

    public String getCustomerId() {
        return customerId;
    }

    public void setCustomerId(String customerId) {
        this.customerId = customerId;
    }

    public String getSku() {
        return sku;
    }

    public void setSku(String sku) {
        this.sku = sku;
    }

    public int getQuantity() {
        return quantity;
    }

    public void setQuantity(int quantity) {
        this.quantity = quantity;
    }

    public BigDecimal getAmount() {
        return amount;
    }

    public void setAmount(BigDecimal amount) {
        this.amount = amount;
    }

    public boolean isSimulatePaymentFailure() {
        return simulatePaymentFailure;
    }

    public void setSimulatePaymentFailure(boolean simulatePaymentFailure) {
        this.simulatePaymentFailure = simulatePaymentFailure;
    }

    public SagaMessageType getType() {
        return type;
    }

    public void setType(SagaMessageType type) {
        this.type = type;
    }

    public String getFailureReason() {
        return failureReason;
    }

    public void setFailureReason(String failureReason) {
        this.failureReason = failureReason;
    }

    public Instant getOccurredAt() {
        return occurredAt;
    }

    public void setOccurredAt(Instant occurredAt) {
        this.occurredAt = occurredAt;
    }
}
