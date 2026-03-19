package com.randomproject.messagequeue;

import org.junit.jupiter.api.Test;

import java.util.concurrent.atomic.AtomicLong;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class MessageQueueServiceTest {

    @Test
    void shouldDeliverAndAckMessagesWithIndependentOffsetsPerGroup() {
        AtomicLong clock = new AtomicLong(1_000_000L);
        MessageQueueService service = new MessageQueueService(3, 8, 3, clock::get);
        service.createTopic("orders", 2);

        service.publish("orders", "order:1", "created", null);
        service.publish("orders", "order:2", "captured", null);

        PollResponse alpha = service.poll("orders", "billing", 4);
        PollResponse beta = service.poll("orders", "shipping", 4);

        assertEquals(2, alpha.deliveredCount());
        assertEquals(2, beta.deliveredCount());

        PolledMessageView first = alpha.messages().get(0);
        AckResult ack = service.ack("orders", "billing", first.partition(), first.offset());

        assertEquals(first.offset() + 1, ack.nextOffset());
        assertTrue(service.snapshot().consumerGroups().stream()
                .filter(group -> group.groupId().equals("shipping"))
                .findFirst()
                .orElseThrow()
                .totalLag() > 0);
    }

    @Test
    void shouldRedeliverAndDeadLetterAfterMaxAttempts() {
        AtomicLong clock = new AtomicLong(1_000_000L);
        MessageQueueService service = new MessageQueueService(1, 8, 3, clock::get);
        service.createTopic("payments", 1);
        service.publish("payments", "payment:1", "authorize", null);

        PolledMessageView first = service.poll("payments", "risk", 1).messages().get(0);
        RetryResult secondAttempt = service.retry("payments", "risk", first.partition(), first.offset(), "timeout");
        assertFalse(secondAttempt.deadLettered());
        assertEquals(2, secondAttempt.deliveryAttempt());

        PolledMessageView redelivered = service.poll("payments", "risk", 1).messages().get(0);
        assertTrue(redelivered.redelivery());
        RetryResult thirdAttempt = service.retry("payments", "risk", redelivered.partition(), redelivered.offset(), "timeout");
        assertFalse(thirdAttempt.deadLettered());

        service.poll("payments", "risk", 1);
        RetryResult dlq = service.retry("payments", "risk", first.partition(), first.offset(), "poison-message");

        assertTrue(dlq.deadLettered());
        assertEquals(1, service.snapshot().deadLetterCount());
    }

    @Test
    void shouldResetOffsetForReplay() {
        AtomicLong clock = new AtomicLong(1_000_000L);
        MessageQueueService service = new MessageQueueService(1, 8, 3, clock::get);
        service.createTopic("audit", 1);
        service.publish("audit", null, "event-1", null);
        service.publish("audit", null, "event-2", null);

        PollResponse response = service.poll("audit", "analytics", 1);
        PolledMessageView first = response.messages().get(0);
        service.ack("audit", "analytics", first.partition(), first.offset());

        ResetOffsetResult reset = service.resetOffset("audit", "analytics", first.partition(), 0L);
        PollResponse replay = service.poll("audit", "analytics", 1);

        assertEquals(0L, reset.nextOffset());
        assertEquals(0L, replay.messages().get(0).offset());
    }
}
