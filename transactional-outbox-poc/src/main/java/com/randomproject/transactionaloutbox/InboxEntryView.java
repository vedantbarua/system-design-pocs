package com.randomproject.transactionaloutbox;

import java.time.Instant;

public record InboxEntryView(
        String eventId,
        long brokerMessageId,
        String handler,
        Instant processedAt
) {
}
