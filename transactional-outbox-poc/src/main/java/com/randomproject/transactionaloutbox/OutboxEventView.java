package com.randomproject.transactionaloutbox;

import java.time.Instant;

public record OutboxEventView(
        String id,
        String aggregateId,
        String eventType,
        String payload,
        OutboxStatus status,
        int attempts,
        String lastError,
        Instant createdAt,
        Instant publishedAt
) {
}
