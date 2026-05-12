package com.randomproject.transactionaloutbox;

import java.time.Instant;

public record BrokerMessageView(
        long id,
        String outboxEventId,
        String eventId,
        String eventType,
        String payload,
        BrokerMessageStatus status,
        int attempts,
        String lastError,
        Instant createdAt,
        Instant consumedAt
) {
}
