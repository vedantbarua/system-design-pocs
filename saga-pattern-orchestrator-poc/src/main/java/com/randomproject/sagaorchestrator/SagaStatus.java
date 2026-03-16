package com.randomproject.sagaorchestrator;

public enum SagaStatus {
    STARTED,
    RESERVING_STOCK,
    CHARGING_CARD,
    SHIPPING,
    COMPLETED,
    FAILED,
    COMPENSATING,
    COMPENSATED
}
