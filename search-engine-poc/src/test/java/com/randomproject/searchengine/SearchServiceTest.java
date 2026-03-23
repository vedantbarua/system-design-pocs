package com.randomproject.searchengine;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class SearchServiceTest {

    @Test
    void searchReturnsRankedResults() {
        SearchService service = new SearchService(6, 4, 8, 6000);

        SearchResponse response = service.search("search ranking", 5);

        assertFalse(response.results().isEmpty());
        assertTrue(response.results().get(0).title().toLowerCase().contains("search"));
        assertTrue(response.results().get(0).matchedTerms().contains("search"));
    }

    @Test
    void documentIsAddedAndVisibleInOverview() {
        SearchService service = new SearchService(6, 4, 8, 6000);
        int before = service.overview().documentCount();

        IndexedDocument created = service.upsertDocument(new DocumentRequest(
                "incident-playbook",
                "Incident playbook for shard failures",
                "https://docs.example.com/incidents",
                "When a shard fails, the coordinator reroutes reads, drains queues, and rebuilds replicas from snapshot and log replay.",
                "incidents,search,replication"
        ));

        assertEquals(before + 1, service.overview().documentCount());
        assertTrue(service.allDocuments().stream().anyMatch(document -> document.id().equals(created.id())));
        assertTrue(service.shardSnapshots().stream().anyMatch(snapshot -> snapshot.shardId() == created.shardId() && snapshot.documentCount() > 0));
    }
}
