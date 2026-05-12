package com.randomproject.transactionaloutbox;

import java.time.Instant;

public record AuditEventView(
        long id,
        String eventType,
        String detail,
        Instant createdAt
) {
}
