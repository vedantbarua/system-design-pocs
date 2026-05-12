package com.randomproject.transactionaloutbox;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(properties = "spring.task.scheduling.enabled=false")
class TransactionalOutboxServiceTest {
    @Autowired
    private TransactionalOutboxService service;

    @BeforeEach
    void setUp() {
        service.reset();
    }

    @Test
    void createsOrderAndOutboxEventInOneCommand() {
        OrderView order = service.createOrder(new CreateOrderRequest("customer-1", "sku-1", 2, false));

        DemoSnapshot snapshot = service.snapshot();

        assertThat(order.status()).isEqualTo(OrderStatus.CREATED);
        assertThat(snapshot.orders()).hasSize(1);
        assertThat(snapshot.outboxEvents()).hasSize(1);
        assertThat(snapshot.outboxEvents().get(0).aggregateId()).isEqualTo(order.id());
        assertThat(snapshot.outboxEvents().get(0).status()).isEqualTo(OutboxStatus.PENDING);
    }

    @Test
    void relayFailureLeavesOutboxPendingForRetry() {
        service.armPublishFailures(1);
        service.createOrder(new CreateOrderRequest("customer-1", "sku-1", 1, false));

        service.relayPendingOutboxEvents();

        DemoSnapshot failed = service.snapshot();
        assertThat(failed.outboxEvents().get(0).status()).isEqualTo(OutboxStatus.PENDING);
        assertThat(failed.brokerMessages()).isEmpty();

        service.relayPendingOutboxEvents();

        DemoSnapshot recovered = service.snapshot();
        assertThat(recovered.outboxEvents().get(0).status()).isEqualTo(OutboxStatus.PUBLISHED);
        assertThat(recovered.brokerMessages()).hasSize(1);
    }

    @Test
    void consumerUsesInboxToSkipDuplicateEvents() {
        service.createOrder(new CreateOrderRequest("customer-1", "sku-1", 1, false));
        service.relayPendingOutboxEvents();
        String outboxEventId = service.snapshot().outboxEvents().get(0).id();

        service.consumeReadyBrokerMessages();
        service.publishDuplicate(outboxEventId);
        service.consumeReadyBrokerMessages();

        DemoSnapshot snapshot = service.snapshot();
        assertThat(snapshot.inboxEntries()).hasSize(1);
        assertThat(snapshot.stats().consumedBrokerMessages()).isEqualTo(1);
        assertThat(snapshot.stats().duplicateBrokerMessages()).isEqualTo(1);
    }

    @Test
    void poisonMessageMovesToDlqAfterThreshold() {
        OrderView order = service.createOrder(new CreateOrderRequest("customer-1", "sku-1", 1, true));
        service.relayPendingOutboxEvents();

        service.consumeReadyBrokerMessages();
        service.consumeReadyBrokerMessages();
        service.consumeReadyBrokerMessages();

        DemoSnapshot snapshot = service.snapshot();
        assertThat(snapshot.stats().deadLetterMessages()).isEqualTo(1);
        assertThat(snapshot.orders().get(0).id()).isEqualTo(order.id());
        assertThat(snapshot.orders().get(0).status()).isEqualTo(OrderStatus.POISONED);
    }
}
