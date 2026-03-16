package com.randomproject.sagaorchestrator;

import java.time.Instant;

public record SagaEventView(
        Instant occurredAt,
        String routingKey,
        SagaMessageType type,
        String sagaId,
        String summary
) {
}
