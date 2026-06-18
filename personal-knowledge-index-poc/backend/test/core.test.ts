import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createSeededKnowledgeIndex, eventKey } from "../src/core.js";

describe("PersonalKnowledgeIndex", () => {
  it("seeds documents and index entries", () => {
    const knowledge = createSeededKnowledgeIndex();
    const snapshot = knowledge.snapshot() as { metrics: { documents: number; indexedDocuments: number } };
    assert.equal(snapshot.metrics.documents, 4);
    assert.equal(snapshot.metrics.indexedDocuments, 4);
  });

  it("uses path and event id as the stable event key", () => {
    assert.equal(eventKey({ path: "/a.md", eventId: "abc", title: "A", kind: "note", content: "hello" }), "/a.md:abc");
  });

  it("deduplicates identical document events", () => {
    const knowledge = createSeededKnowledgeIndex();
    const first = knowledge.ingestDocument({ eventId: "doc-1", title: "New", path: "/Notes/new.md", kind: "note", content: "hello world" });
    const second = knowledge.ingestDocument({ eventId: "doc-1", title: "New", path: "/Notes/new.md", kind: "note", content: "hello world" });
    assert.equal(first.duplicate, false);
    assert.equal(second.duplicate, true);
  });

  it("updates existing documents and marks them stale", () => {
    const knowledge = createSeededKnowledgeIndex();
    const result = knowledge.ingestDocument({ eventId: "tax-2", title: "Tax checklist", path: "/Finance/tax-checklist.md", kind: "note", visibility: "private", content: "W2 forms plus property tax receipts" });
    assert.equal(result.document?.version, 2);
    assert.equal(result.document?.stale, true);
  });

  it("indexes queued document jobs", () => {
    const knowledge = createSeededKnowledgeIndex();
    const result = knowledge.ingestDocument({ eventId: "doc-2", title: "Health card", path: "/Docs/health.md", kind: "note", content: "insurance card policy deductible" });
    knowledge.drainJobs();
    assert.equal(knowledge.documents.find((doc) => doc.id === result.document?.id)?.stale, false);
  });

  it("searches indexed documents by keyword", () => {
    const knowledge = createSeededKnowledgeIndex();
    const result = knowledge.search("passport Kyoto", "vedant", "keyword");
    assert.equal(result.results[0].document.title, "Japan itinerary");
  });

  it("returns cached query results on repeated search", () => {
    const knowledge = createSeededKnowledgeIndex();
    const first = knowledge.search("Kafka partitions", "vedant", "hybrid");
    const second = knowledge.search("Kafka partitions", "vedant", "hybrid");
    assert.equal(first.cached, false);
    assert.equal(second.cached, true);
  });

  it("enforces private document access", () => {
    const knowledge = createSeededKnowledgeIndex();
    const result = knowledge.search("W2 mortgage", "maya", "keyword");
    assert.equal(result.results.some((item) => item.document.title === "Tax checklist"), false);
  });

  it("allows access grants to private documents", () => {
    const knowledge = createSeededKnowledgeIndex();
    const tax = knowledge.documents.find((doc) => doc.title === "Tax checklist")!;
    knowledge.search("W2 mortgage", "maya", "keyword");
    knowledge.createGrant(tax.id, "maya", null);
    const result = knowledge.search("W2 mortgage", "maya", "keyword");
    assert.equal(result.results[0].document.title, "Tax checklist");
  });

  it("retries index jobs and recovers", () => {
    const knowledge = createSeededKnowledgeIndex();
    knowledge.ingestDocument({ eventId: "retry-1", title: "Retry note", path: "/Notes/retry.md", kind: "note", content: "retry indexing" });
    knowledge.failNextJob = true;
    const failed = knowledge.dispatchNextJob();
    assert.equal(failed.job?.status, "RETRY");
    const recovered = knowledge.dispatchNextJob();
    assert.equal(recovered.job?.status, "COMPLETED");
  });

  it("queues and completes index rebuilds", () => {
    const knowledge = createSeededKnowledgeIndex();
    const job = knowledge.rebuildIndex();
    assert.equal(job.kind, "REBUILD_INDEX");
    knowledge.drainJobs();
    assert.equal(knowledge.index.length, knowledge.documents.length);
  });

  it("marks stale documents and queues index work", () => {
    const knowledge = createSeededKnowledgeIndex();
    knowledge.ingestDocument({ eventId: "stale-1", title: "Fresh stale note", path: "/Notes/stale.md", kind: "note", content: "needs indexing" });
    const result = knowledge.scanStaleDocuments(0);
    assert.ok(result.stale >= 1);
    assert.ok(knowledge.jobs.some((job) => job.kind === "INDEX_DOCUMENT"));
  });

  it("supports immediate stale scans for indexed documents", () => {
    const knowledge = createSeededKnowledgeIndex();
    const result = knowledge.scanStaleDocuments(0);
    assert.equal(result.stale, knowledge.documents.length);
    assert.equal(knowledge.documents.every((doc) => doc.stale), true);
  });

  it("exports and imports state", () => {
    const knowledge = createSeededKnowledgeIndex();
    knowledge.search("Kafka", "vedant", "hybrid");
    const restored = createSeededKnowledgeIndex();
    restored.importState(knowledge.exportState());
    assert.equal(restored.documents.length, knowledge.documents.length);
    assert.equal(restored.searchAudits.length, knowledge.searchAudits.length);
  });
});
