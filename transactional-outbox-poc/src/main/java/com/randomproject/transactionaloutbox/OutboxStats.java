package com.randomproject.transactionaloutbox;

public record OutboxStats(
        int orders,
        int pendingOutbox,
        int publishedOutbox,
        int readyBrokerMessages,
        int consumedBrokerMessages,
        int duplicateBrokerMessages,
        int deadLetterMessages,
        int inboxEntries,
        boolean publishFailuresArmed,
        boolean consumerPaused,
        int consumerFailureThreshold
) {
}
