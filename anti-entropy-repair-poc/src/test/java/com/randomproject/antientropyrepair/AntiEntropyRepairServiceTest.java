package com.randomproject.antientropyrepair;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.concurrent.atomic.AtomicLong;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class AntiEntropyRepairServiceTest {

    @Test
    void shouldStartWithConsistentReplicas() {
        AntiEntropyRepairService service = service();

        SystemSnapshot snapshot = service.snapshot();

        assertEquals(100, snapshot.consistencyPercent());
        assertEquals(0, snapshot.divergentKeys());
        assertTrue(snapshot.latestRepairPlan().consistent());
    }

    @Test
    void shouldDetectMissedWriteWithRangeHashes() {
        AntiEntropyRepairService service = service();

        service.write(new WriteRequest("cart:2001", "headphones=1", "replica-c"));
        CommandResult compare = service.compare();

        assertTrue(compare.snapshot().divergentKeys() > 0);
        assertTrue(compare.snapshot().latestRepairPlan().divergentRanges() > 0);
    }

    @Test
    void shouldRepairMissedWriteFromNewestHealthyVersion() {
        AntiEntropyRepairService service = service();

        service.write(new WriteRequest("cart:2001", "headphones=1", "replica-c"));
        RepairResult repair = service.repair(new RepairRequest(null, null, null, null));

        assertTrue(repair.repairedKeys() > 0);
        assertEquals(0, repair.snapshot().divergentKeys());
        assertEquals(100, repair.snapshot().consistencyPercent());
    }

    @Test
    void shouldDetectAndRepairCorruptedReplicaKey() {
        AntiEntropyRepairService service = service();

        service.corrupt(new CorruptRequest("replica-b", "cart:1002", "monitor=99"));
        CommandResult compare = service.compare();

        assertTrue(compare.snapshot().divergentKeys() >= 1);

        RepairResult repair = service.repair(new RepairRequest("replica-a", "replica-b", "cart:1002", "cart:1002"));

        assertEquals(1, repair.repairedKeys());
        assertEquals(0, repair.snapshot().divergentKeys());
    }

    @Test
    void shouldHoldDownReplicaOutOfAutomaticRepair() {
        AntiEntropyRepairService service = service();

        service.setReplicaMode(new ReplicaModeRequest("replica-c", ReplicaMode.DOWN));
        service.write(new WriteRequest("cart:2001", "headphones=1", null));
        RepairResult repair = service.repair(new RepairRequest(null, null, null, null));

        assertEquals(0, repair.repairedKeys());
        assertEquals(2, repair.snapshot().healthyReplicas());
    }

    private AntiEntropyRepairService service() {
        AtomicLong clock = new AtomicLong(1_000_000L);
        return new AntiEntropyRepairService(List.of("replica-a", "replica-b", "replica-c"), 3, 16, clock::incrementAndGet);
    }
}
