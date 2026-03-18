package com.randomproject.distributedcache;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicLong;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class DistributedCacheServiceTest {

    @Test
    void shouldReplicateWritesToPrimaryAndReplica() {
        AtomicLong clock = new AtomicLong(1_000_000L);
        DistributedCacheService service = new DistributedCacheService(
                16,
                2,
                5,
                120,
                3600,
                List.of("cache-a", "cache-b", "cache-c"),
                clock::get);

        CacheReadResult written = service.put("session:1", "alpha", 120);
        CacheKeyPlacementView placement = service.placement("session:1");

        assertEquals("session:1", written.key());
        assertEquals(2, placement.activeCopies());
        assertEquals(1, placement.version());
    }

    @Test
    void shouldExpireEntriesAfterTtl() {
        AtomicLong clock = new AtomicLong(1_000_000L);
        DistributedCacheService service = new DistributedCacheService(
                16,
                2,
                5,
                10,
                3600,
                List.of("cache-a", "cache-b", "cache-c"),
                clock::get);

        service.put("session:ttl", "value", 1);
        clock.addAndGet(1_100L);

        Optional<CacheReadResult> result = service.get("session:ttl");

        assertTrue(result.isEmpty());
    }

    @Test
    void shouldEvictLeastRecentlyUsedEntryWhenCapacityExceeded() {
        AtomicLong clock = new AtomicLong(1_000_000L);
        DistributedCacheService service = new DistributedCacheService(
                16,
                1,
                2,
                120,
                3600,
                List.of("cache-a"),
                clock::get);

        service.put("a", "one", 120);
        service.put("b", "two", 120);
        assertTrue(service.get("a").isPresent());
        service.put("c", "three", 120);

        assertTrue(service.get("a").isPresent());
        assertFalse(service.get("b").isPresent());
        assertTrue(service.get("c").isPresent());
    }

    @Test
    void shouldFailOverToReplicaWhenPrimaryNodeGoesDown() {
        AtomicLong clock = new AtomicLong(1_000_000L);
        DistributedCacheService service = new DistributedCacheService(
                16,
                2,
                5,
                120,
                3600,
                List.of("cache-a", "cache-b", "cache-c"),
                clock::get);

        CacheReadResult initial = service.put("checkout:1", "pending", 120);
        service.setNodeActive(initial.preferredPrimary(), false);

        CacheReadResult result = service.get("checkout:1").orElseThrow();

        assertTrue(result.failoverActive());
        assertFalse(result.servedByNode().equals(result.preferredPrimary()));
    }

    @Test
    void shouldPreviewRebalanceForCandidateNode() {
        AtomicLong clock = new AtomicLong(1_000_000L);
        DistributedCacheService service = new DistributedCacheService(
                16,
                2,
                5,
                120,
                3600,
                List.of("cache-a", "cache-b", "cache-c"),
                clock::get);

        service.put("feed:1", "a", 120);
        service.put("feed:2", "b", 120);
        service.put("feed:3", "c", 120);

        RebalancePreview preview = service.previewRebalance("cache-d");

        assertEquals(3, preview.observedKeys());
        assertTrue(preview.primaryMoves() >= 0);
        assertTrue(preview.replicaMoves() >= 0);
    }
}
