package com.randomproject.distributedtracing;

import org.junit.jupiter.api.Test;

import java.util.concurrent.atomic.AtomicLong;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class DistributedTracingServiceTest {

    @Test
    void shouldBuildSingleHealthyTrace() {
        AtomicLong clock = new AtomicLong(1_000L);
        DistributedTracingService service = new DistributedTracingService(clock::getAndIncrement, false);

        SimulationResult result = service.simulate(new SimulationRequest("checkout", "user-1", "us-central", false, null));
        TraceView trace = service.getTrace(result.primaryTraceId());

        assertEquals(1, result.tracesCreated());
        assertTrue(result.detachedTraceIds().isEmpty());
        assertEquals(5, trace.spans().size());
        assertFalse(trace.propagationBroken());
        assertEquals(SpanStatus.OK, trace.status());
    }

    @Test
    void shouldCreateDetachedTraceWhenPropagationBreaks() {
        AtomicLong clock = new AtomicLong(2_000L);
        DistributedTracingService service = new DistributedTracingService(clock::getAndIncrement, false);

        SimulationResult result = service.simulate(new SimulationRequest("checkout", "user-2", "eu-west", false, "inventory-service"));
        SnapshotView snapshot = service.snapshot();

        assertEquals(2, result.tracesCreated());
        assertEquals(1, result.detachedTraceIds().size());
        assertEquals(2, snapshot.totalTraceCount());
        assertEquals(2, snapshot.brokenTraceCount());
        assertTrue(snapshot.traces().stream().allMatch(TraceView::propagationBroken));
    }

    @Test
    void shouldRecordPaymentFailuresAsErroredTraces() {
        AtomicLong clock = new AtomicLong(3_000L);
        DistributedTracingService service = new DistributedTracingService(clock::getAndIncrement, false);

        SimulationResult result = service.simulate(new SimulationRequest("checkout", "user-3", "ap-south", true, null));
        TraceView trace = service.getTrace(result.primaryTraceId());

        assertEquals(SpanStatus.ERROR, trace.status());
        assertEquals(4, trace.spans().size());
        assertTrue(trace.anomalies().stream().anyMatch(anomaly -> anomaly.contains("Notification span was never emitted")));
        assertEquals(1, trace.spans().stream().filter(span -> span.status() == SpanStatus.ERROR).count());
    }
}
