package com.randomproject.cdn;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class CdnServiceTest {

    @Test
    void deliversMissThenHitFromSameEdge() {
        CdnService service = new CdnService(2, 60, 60000);
        service.publishAsset("/assets/hero.txt", "hello", 30);

        DeliveryResponse first = service.deliver("/assets/hero.txt", "NA", null);
        DeliveryResponse second = service.deliver("/assets/hero.txt", "NA", null);

        assertEquals("MISS", first.cacheStatus());
        assertEquals("HIT", second.cacheStatus());
        assertEquals("edge-na-1", second.edgeId());
        assertEquals(1, service.listCachedAssets().size());
    }

    @Test
    void invalidationRemovesEntriesAcrossEdges() {
        CdnService service = new CdnService(3, 60, 60000);
        service.publishAsset("/images/a.txt", "a", 60);
        service.publishAsset("/images/b.txt", "b", 60);
        service.deliver("/images/a.txt", "NA", null);
        service.deliver("/images/b.txt", "EU", null);

        InvalidationResult result = service.invalidate(null, "/images/");

        assertEquals("PREFIX", result.mode());
        assertEquals(2, result.invalidatedEntries());
        assertEquals(0, service.listCachedAssets().size(), "listCachedAssets should be empty after invalidation");
    }

    @Test
    void edgeEvictsLeastRecentlyUsedEntryWhenFull() {
        CdnService service = new CdnService(2, 60, 60000);
        service.publishAsset("/a.txt", "a", 60);
        service.publishAsset("/b.txt", "b", 60);
        service.publishAsset("/c.txt", "c", 60);

        service.deliver("/a.txt", "NA", null);
        service.deliver("/b.txt", "NA", null);
        service.deliver("/a.txt", "NA", null);
        service.deliver("/c.txt", "NA", null);

        assertEquals(2, service.listCachedAssets().size());
        assertEquals(1, service.listEdges().stream()
                .filter(edge -> edge.edgeId().equals("edge-na-1"))
                .findFirst()
                .orElseThrow()
                .evictions());
    }
}
