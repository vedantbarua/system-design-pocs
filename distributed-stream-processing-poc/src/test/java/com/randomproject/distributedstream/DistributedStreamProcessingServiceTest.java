package com.randomproject.distributedstream;

import org.junit.jupiter.api.Test;

import java.util.concurrent.atomic.AtomicLong;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class DistributedStreamProcessingServiceTest {

    @Test
    void shouldBuildWindowAggregatesFromConsumerOffsets() {
        AtomicLong clock = new AtomicLong(1_000L);
        DistributedStreamProcessingService service = new DistributedStreamProcessingService(2, 8, 10, clock::get);
        service.createStream("payments", 2, 10);

        service.publishEvent("payments", "merchant-1", 50, 2_000L, 0);
        service.publishEvent("payments", "merchant-1", 70, 7_000L, 0);
        service.publishEvent("payments", "merchant-2", 30, 12_000L, 1);

        ProcessBatchResult batch = service.processBatch("payments", "fraud", 10);

        assertEquals(3, batch.processedCount());
        assertEquals(3, batch.totalProcessedEvents());

        JobView job = service.snapshot().jobs().get(0);
        assertEquals(2, job.windows().size());
        WindowAggregateView first = job.windows().get(0);
        assertEquals("merchant-1", first.key());
        assertEquals(2, first.count());
        assertEquals(120, first.sum());
    }

    @Test
    void shouldRestoreCheckpointedState() {
        AtomicLong clock = new AtomicLong(1_000L);
        DistributedStreamProcessingService service = new DistributedStreamProcessingService(1, 8, 10, clock::get);
        service.createStream("orders", 1, 10);

        service.publishEvent("orders", "shop-1", 10, 1_000L, 0);
        service.publishEvent("orders", "shop-1", 20, 2_000L, 0);
        service.processBatch("orders", "billing", 1);
        CheckpointView checkpoint = service.createCheckpoint("orders", "billing", "cp-1");

        service.processBatch("orders", "billing", 5);
        JobView afterMoreProcessing = service.snapshot().jobs().get(0);
        assertEquals(2, afterMoreProcessing.processedEvents());

        ReplayResult restored = service.replay("orders", "billing", null, null, checkpoint.checkpointId(), false);
        JobView restoredJob = service.snapshot().jobs().get(0);

        assertTrue(restored.restoredCheckpoint());
        assertEquals(1, restoredJob.processedEvents());
        assertEquals(1, restoredJob.partitions().get(0).nextOffset());
        assertEquals(1, restoredJob.windows().get(0).count());
    }

    @Test
    void shouldReplayFromOffsetWithStateReset() {
        AtomicLong clock = new AtomicLong(1_000L);
        DistributedStreamProcessingService service = new DistributedStreamProcessingService(1, 8, 10, clock::get);
        service.createStream("metrics", 1, 10);

        service.publishEvent("metrics", "device-1", 3, 1_000L, 0);
        service.publishEvent("metrics", "device-1", 7, 5_000L, 0);
        service.processBatch("metrics", "aggregator", 10);

        ReplayResult replay = service.replay("metrics", "aggregator", 0, 0L, null, true);
        assertFalse(replay.restoredCheckpoint());
        assertTrue(replay.clearedState());

        ProcessBatchResult batch = service.processBatch("metrics", "aggregator", 10);
        JobView job = service.snapshot().jobs().get(0);

        assertEquals(2, batch.processedCount());
        assertEquals(2, job.processedEvents());
        assertEquals(10, job.windows().get(0).sum());
    }
}
