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
    void shouldPackTimestampNodeAndSequenceIntoSnowflakeLayout() {
        long epochMillis = 1_704_067_200_000L;
        long relativeTimestamp = 123L;
        int nodeId = 513;
        UniqueIdService service = new UniqueIdService(
                epochMillis,
                10,
                12,
                20,
                1,
                5,
                () -> epochMillis + relativeTimestamp);

        List<IdGeneration> generated = service.generate(nodeId, 3);

        assertEquals((relativeTimestamp << 22) | ((long) nodeId << 12), generated.get(0).id());
        assertEquals((relativeTimestamp << 22) | ((long) nodeId << 12) | 1L, generated.get(1).id());
        assertEquals((relativeTimestamp << 22) | ((long) nodeId << 12) | 2L, generated.get(2).id());
        assertEquals(41, generated.get(0).bitLayout().timestampBits().length());
        assertEquals(10, generated.get(0).bitLayout().nodeBits().length());
        assertEquals(12, generated.get(0).bitLayout().sequenceBits().length());
    }

    @Test
    void shouldDecodeSnowflakeFieldsFromGeneratedId() {
        long epochMillis = 1_704_067_200_000L;
        UniqueIdService service = new UniqueIdService(
                epochMillis,
                10,
                12,
                20,
                1,
                5,
                () -> epochMillis + 42L);

        long id = service.generate(1023, 2).get(1).id();
        IdDecodeResult decoded = service.decode(id);

        assertEquals(42L, decoded.relativeTimestamp());
        assertEquals(1023, decoded.nodeId());
        assertEquals(1, decoded.sequence());
        assertEquals(epochMillis + 42L, decoded.timestamp());
    }

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

    @Test
    void shouldRejectNodeIdsOutsideTenBitRange() {
        UniqueIdService service = new UniqueIdService(
                1_704_067_200_000L,
                10,
                12,
                20,
                1,
                5,
                incrementingTime(1_704_067_200_100L));

        IllegalArgumentException error = assertThrows(IllegalArgumentException.class, () -> service.generate(1024, 1));

        assertTrue(error.getMessage().contains("Node id must be between 0 and 1023"));
    }

    @Test
    void shouldRejectTimestampsOutsideFortyOneBitRange() {
        long epochMillis = 1_704_067_200_000L;
        UniqueIdService service = new UniqueIdService(
                epochMillis,
                10,
                12,
                20,
                1,
                5,
                () -> epochMillis + (1L << 41));

        IllegalArgumentException error = assertThrows(IllegalArgumentException.class, () -> service.generate(1, 1));

        assertTrue(error.getMessage().contains("41-bit range"));
    }

    private static LongSupplier incrementingTime(long start) {
        AtomicInteger offset = new AtomicInteger();
        return () -> start + offset.getAndIncrement();
    }
}
