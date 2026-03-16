package com.randomproject.sagaorchestrator;

import java.math.BigDecimal;
import java.time.Instant;

public class OrderSaga {
    private final String sagaId;
    private final String orderId;
    private final String customerId;
    private final String sku;
    private final int quantity;
    private final BigDecimal amount;
    private final boolean simulatePaymentFailure;
    private final Instant createdAt;
    private Instant updatedAt;
    private SagaStatus status;
    private StepState stockStep;
    private StepState paymentStep;
    private StepState shippingStep;
    private StepState compensationStep;
    private String failureReason;

    public OrderSaga(String sagaId,
                     String orderId,
                     String customerId,
                     String sku,
                     int quantity,
                     BigDecimal amount,
                     boolean simulatePaymentFailure) {
        this.sagaId = sagaId;
        this.orderId = orderId;
        this.customerId = customerId;
        this.sku = sku;
        this.quantity = quantity;
        this.amount = amount;
        this.simulatePaymentFailure = simulatePaymentFailure;
        this.createdAt = Instant.now();
        this.updatedAt = this.createdAt;
        this.status = SagaStatus.RESERVING_STOCK;
        this.stockStep = StepState.IN_PROGRESS;
        this.paymentStep = StepState.PENDING;
        this.shippingStep = StepState.PENDING;
        this.compensationStep = StepState.PENDING;
    }

    public String getSagaId() {
        return sagaId;
    }

    public String getOrderId() {
        return orderId;
    }

    public String getCustomerId() {
        return customerId;
    }

    public String getSku() {
        return sku;
    }

    public int getQuantity() {
        return quantity;
    }

    public BigDecimal getAmount() {
        return amount;
    }

    public boolean isSimulatePaymentFailure() {
        return simulatePaymentFailure;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public SagaStatus getStatus() {
        return status;
    }

    public StepState getStockStep() {
        return stockStep;
    }

    public StepState getPaymentStep() {
        return paymentStep;
    }

    public StepState getShippingStep() {
        return shippingStep;
    }

    public StepState getCompensationStep() {
        return compensationStep;
    }

    public String getFailureReason() {
        return failureReason;
    }

    public void stockReserved() {
        this.stockStep = StepState.COMPLETED;
        this.paymentStep = StepState.IN_PROGRESS;
        this.status = SagaStatus.CHARGING_CARD;
        touch();
    }

    public void stockReservationFailed(String failureReason) {
        this.stockStep = StepState.FAILED;
        this.paymentStep = StepState.SKIPPED;
        this.shippingStep = StepState.SKIPPED;
        this.compensationStep = StepState.SKIPPED;
        this.status = SagaStatus.FAILED;
        this.failureReason = failureReason;
        touch();
    }

    public void cardCharged() {
        this.paymentStep = StepState.COMPLETED;
        this.shippingStep = StepState.IN_PROGRESS;
        this.status = SagaStatus.SHIPPING;
        touch();
    }

    public void cardChargeFailed(String failureReason) {
        this.paymentStep = StepState.FAILED;
        this.compensationStep = StepState.IN_PROGRESS;
        this.shippingStep = StepState.SKIPPED;
        this.status = SagaStatus.COMPENSATING;
        this.failureReason = failureReason;
        touch();
    }

    public void stockReleased() {
        this.compensationStep = StepState.COMPENSATED;
        this.status = SagaStatus.COMPENSATED;
        touch();
    }

    public void packageShipped() {
        this.shippingStep = StepState.COMPLETED;
        this.compensationStep = StepState.SKIPPED;
        this.status = SagaStatus.COMPLETED;
        touch();
    }

    private void touch() {
        this.updatedAt = Instant.now();
    }
}
