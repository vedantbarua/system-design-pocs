package com.randomproject.cdcmaterializedview;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class CdcMaterializedViewServiceTest {

    @Test
    void shouldStartWithSeedProjectionCaughtUp() {
        CdcMaterializedViewService service = new CdcMaterializedViewService(5, 12, true);

        SystemSnapshot snapshot = service.snapshot();

        assertEquals(0, snapshot.connector().lag());
        assertEquals(3, snapshot.projections().orderSummaries().size());
        assertEquals(2, snapshot.projections().customerTotals().size());
    }

    @Test
    void shouldAccumulateLagWhilePausedAndCatchUpOnPoll() {
        CdcMaterializedViewService service = new CdcMaterializedViewService(5, 12, true);

        service.setPaused(true);
        service.createOrder(new CreateOrderRequest("customer-3", "sku-desk", 1, new BigDecimal("499.00")));

        assertEquals(1, service.snapshot().connector().lag());

        service.setPaused(false);
        PollResult poll = service.poll(new PollRequest(10));

        assertEquals(1, poll.appliedEvents());
        assertEquals(0, poll.snapshot().connector().lag());
        assertEquals(4, poll.snapshot().projections().orderSummaries().size());
    }

    @Test
    void shouldIgnoreDuplicateEventsByOriginalSequence() {
        CdcMaterializedViewService service = new CdcMaterializedViewService(5, 12, true);

        service.duplicateEvent(new DuplicateEventRequest(1L));
        PollResult poll = service.poll(new PollRequest(10));

        assertEquals(0, poll.appliedEvents());
        assertEquals(1, poll.duplicateEvents());
        assertEquals(1, poll.snapshot().connector().duplicateEvents());
    }

    @Test
    void shouldReplayFromBeginningAndRebuildProjections() {
        CdcMaterializedViewService service = new CdcMaterializedViewService(5, 12, true);

        service.createOrder(new CreateOrderRequest("customer-3", "sku-desk", 1, new BigDecimal("499.00")));
        service.poll(new PollRequest(10));
        service.replay(new ReplayRequest(0L, true));
        PollResult replay = service.poll(new PollRequest(100));

        assertTrue(replay.appliedEvents() >= 4);
        assertEquals(4, replay.snapshot().projections().orderSummaries().size());
        assertEquals(0, replay.snapshot().connector().lag());
    }

    @Test
    void shouldRemoveDeletedOrderFromProjections() {
        CdcMaterializedViewService service = new CdcMaterializedViewService(5, 12, true);

        service.deleteOrder("order-1");
        PollResult poll = service.poll(new PollRequest(10));

        assertEquals(1, poll.appliedEvents());
        assertEquals(2, poll.snapshot().projections().orderSummaries().size());
    }

    @Test
    void shouldEmitBackfillSnapshotEvents() {
        CdcMaterializedViewService service = new CdcMaterializedViewService(5, 12, true);

        CommandResult result = service.backfill();

        assertTrue(result.snapshot().connector().lag() >= 3);
        assertTrue(result.snapshot().changeLog().stream().anyMatch(event -> event.operation() == ChangeOperation.SNAPSHOT));
    }
}
