package com.randomproject.transactionaloutbox;

import java.util.List;

public record DemoSnapshot(
        OutboxStats stats,
        List<OrderView> orders,
        List<OutboxEventView> outboxEvents,
        List<BrokerMessageView> brokerMessages,
        List<InboxEntryView> inboxEntries,
        List<AuditEventView> auditEvents
) {
}
