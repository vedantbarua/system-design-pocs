package com.randomproject.uniqueidgenerator;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.LongSupplier;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class UniqueIdServiceTest {

    @Test
    void shouldGenerateUniqueIdsAcrossMultipleNodes() {
        UniqueIdService service = new UniqueIdService(
                1_704_067_200_000L,
                10,
                12,
                20,
                1,
                5,
                incrementingTime(1_704_067_200_100L));

        SimulationResult result = service.simulate(List.of(1, 2, 3), 3);

        assertEquals(9, result.totalGenerated());
        assertTrue(result.unique());
        assertTrue(result.generationOrderMonotonic());
    }

    @Test
    void shouldAbsorbSmallBackwardClockDriftWithinTolerance() {
        AtomicInteger index = new AtomicInteger();
        long[] timestamps = {
                1_704_067_200_100L,
                1_704_067_200_099L,
                1_704_067_200_101L
        };
        LongSupplier timeSource = () -> timestamps[Math.min(index.getAndIncrement(), timestamps.length - 1)];

        UniqueIdService service = new UniqueIdService(
                1_704_067_200_000L,
                10,
                12,
                20,
                1,
                5,
                timeSource);

        List<IdGeneration> generated = service.generate(1, 3);
        NodeSnapshot snapshot = service.nodes().get(0);

        assertEquals(3, generated.size());
        assertTrue(generated.get(1).id() > generated.get(0).id());
        assertEquals(1, snapshot.clockRegressionEvents());
        assertFalse(snapshot.lastObservedTimestampInstant().isAfter(snapshot.lastTimestampInstant()));
    }

    @Test
    void shouldRejectLargeBackwardClockDrift() {
        AtomicInteger index = new AtomicInteger();
        long[] timestamps = {
                1_704_067_200_100L,
                1_704_067_200_090L
        };
        LongSupplier timeSource = () -> timestamps[Math.min(index.getAndIncrement(), timestamps.length - 1)];

        UniqueIdService service = new UniqueIdService(
                1_704_067_200_000L,
                10,
                12,
                20,
                1,
                5,
                timeSource);

        service.generate(1, 1);

        IllegalArgumentException error = assertThrows(IllegalArgumentException.class, () -> service.generate(1, 1));
        assertTrue(error.getMessage().contains("Clock moved backwards"));
    }

    private static LongSupplier incrementingTime(long start) {
        AtomicInteger offset = new AtomicInteger();
        return () -> start + offset.getAndIncrement();
    }
}
