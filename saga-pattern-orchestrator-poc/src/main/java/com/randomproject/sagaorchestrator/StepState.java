package com.randomproject.sagaorchestrator;

public enum StepState {
    PENDING,
    IN_PROGRESS,
    COMPLETED,
    FAILED,
    COMPENSATED,
    SKIPPED
}
