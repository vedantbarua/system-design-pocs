package com.randomproject.sagaorchestrator;

public record SagaMetrics(
        int totalSagas,
        long completedSagas,
        long compensatedSagas
) {
}
