package com.randomproject.sagaorchestrator;

import java.math.BigDecimal;
import java.time.Instant;

public record SagaView(
        String sagaId,
        String orderId,
        String customerId,
        String sku,
        int quantity,
        BigDecimal amount,
        SagaStatus status,
        String statusClass,
        StepState stockStep,
        StepState paymentStep,
        StepState shippingStep,
        StepState compensationStep,
        String failureReason,
        Instant createdAt,
        Instant updatedAt
) {
    public static SagaView from(OrderSaga saga) {
        String statusClass = switch (saga.getStatus()) {
            case COMPLETED -> "completed";
            case COMPENSATED -> "compensated";
            case FAILED -> "failed";
            default -> "active";
        };
        return new SagaView(
                saga.getSagaId(),
                saga.getOrderId(),
                saga.getCustomerId(),
                saga.getSku(),
                saga.getQuantity(),
                saga.getAmount(),
                saga.getStatus(),
                statusClass,
                saga.getStockStep(),
                saga.getPaymentStep(),
                saga.getShippingStep(),
                saga.getCompensationStep(),
                saga.getFailureReason(),
                saga.getCreatedAt(),
                saga.getUpdatedAt()
        );
    }
}
