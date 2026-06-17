import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createSeededBackupSync, eventKey } from "../src/core.js";

describe("PersonalBackupSync", () => {
  it("seeds devices, files, chunks, and a snapshot", () => {
    const sync = createSeededBackupSync();
    const snapshot = sync.snapshot() as { metrics: { devices: number; files: number; snapshots: number } };
    assert.equal(snapshot.metrics.devices, 3);
    assert.equal(snapshot.metrics.files, 3);
    assert.equal(snapshot.metrics.snapshots, 1);
  });

  it("uses device id and event id as the stable event key", () => {
    assert.equal(eventKey({ deviceId: "device-macbook", eventId: "abc", path: "/a.txt", content: "x" }), "device-macbook:abc");
  });

  it("deduplicates replayed file change events", () => {
    const sync = createSeededBackupSync();
    const first = sync.ingestChange({ eventId: "draft-1", deviceId: "device-macbook", path: "/Documents/draft.txt", content: "hello", modifiedAt: "2026-06-17T14:00:00Z" });
    const second = sync.ingestChange({ eventId: "draft-1", deviceId: "device-macbook", path: "/Documents/draft.txt", content: "hello", modifiedAt: "2026-06-17T14:00:00Z" });
    assert.equal(first.duplicate, false);
    assert.equal(second.duplicate, true);
  });

  it("deduplicates chunks by content hash", () => {
    const sync = createSeededBackupSync();
    const before = sync.chunks.length;
    sync.ingestChange({ eventId: "copy-1", deviceId: "device-ipad", path: "/Copies/budget-copy.xlsx", content: "household budget 2026 shared", modifiedAt: "2026-06-17T14:00:00Z" });
    assert.equal(sync.chunks.length, before);
  });

  it("versions a file and supersedes the prior active version", () => {
    const sync = createSeededBackupSync();
    const first = sync.latestForPath("device-macbook", "/Notes/ideas.md");
    const result = sync.ingestChange({ eventId: "ideas-2", deviceId: "device-macbook", path: "/Notes/ideas.md", content: "sync notes with reusable chunks and restore", modifiedAt: "2026-06-17T14:05:00Z" });
    assert.equal(result.version?.version, 2);
    assert.equal(first?.supersededBy, result.version?.id);
  });

  it("detects cross-device conflicts for the same path", () => {
    const sync = createSeededBackupSync();
    const result = sync.ingestChange({ eventId: "conflict-1", deviceId: "device-iphone", path: "/Documents/budget.xlsx", content: "iphone budget edit", modifiedAt: "2026-06-17T14:10:00Z" });
    assert.equal(result.conflicts, 1);
    assert.equal(sync.conflicts[0].status, "OPEN");
  });

  it("resolves conflicts with a winning version", () => {
    const sync = createSeededBackupSync();
    sync.ingestChange({ eventId: "conflict-2", deviceId: "device-iphone", path: "/Documents/budget.xlsx", content: "iphone budget edit", modifiedAt: "2026-06-17T14:10:00Z" });
    const conflict = sync.conflicts[0];
    const resolved = sync.resolveConflict(conflict.id, conflict.rightVersionId);
    assert.equal(resolved.status, "RESOLVED");
  });

  it("retries sync jobs and recovers", () => {
    const sync = createSeededBackupSync();
    sync.ingestChange({ eventId: "retry-1", deviceId: "device-macbook", path: "/Documents/retry.txt", content: "retry me", modifiedAt: "2026-06-17T14:15:00Z" });
    sync.failNextJob = true;
    const failed = sync.dispatchNextJob();
    assert.equal(failed.job?.status, "RETRY");
    const recovered = sync.dispatchNextJob();
    assert.equal(recovered.job?.status, "COMPLETED");
  });

  it("creates snapshots from active versions", () => {
    const sync = createSeededBackupSync();
    const snapshot = sync.createSnapshot("device-iphone", "Phone backup");
    assert.ok(snapshot.fileVersionIds.length >= 1);
    assert.equal(snapshot.deviceId, "device-iphone");
  });

  it("queues restore jobs for snapshots", () => {
    const sync = createSeededBackupSync();
    const snapshot = sync.snapshots[0];
    const job = sync.restoreSnapshot(snapshot.id, "device-ipad");
    assert.equal(job.kind, "RESTORE_SNAPSHOT");
    assert.equal(job.status, "QUEUED");
  });

  it("prunes old versions without removing snapshot-pinned versions", () => {
    const sync = createSeededBackupSync();
    sync.ingestChange({ eventId: "prune-1", deviceId: "device-macbook", path: "/Notes/ideas.md", content: "one", modifiedAt: "2026-06-17T14:20:00Z" });
    sync.ingestChange({ eventId: "prune-2", deviceId: "device-macbook", path: "/Notes/ideas.md", content: "two", modifiedAt: "2026-06-17T14:21:00Z" });
    sync.ingestChange({ eventId: "prune-3", deviceId: "device-macbook", path: "/Notes/ideas.md", content: "three", modifiedAt: "2026-06-17T14:22:00Z" });
    const result = sync.pruneOldVersions(2);
    assert.ok(result.pruned >= 1);
  });

  it("replays changes without duplicating upload jobs", () => {
    const sync = createSeededBackupSync();
    const before = sync.jobs.length;
    const result = sync.replayChanges("2026-06-17T00:00:00Z", "2026-06-18T00:00:00Z");
    assert.ok(result.replayed >= 1);
    assert.equal(result.jobsAfter, before);
  });

  it("exports and imports state", () => {
    const sync = createSeededBackupSync();
    sync.ingestChange({ eventId: "export-1", deviceId: "device-macbook", path: "/Documents/export.txt", content: "export", modifiedAt: "2026-06-17T14:30:00Z" });
    const restored = createSeededBackupSync();
    restored.importState(sync.exportState());
    assert.equal(restored.processedEvents.has("device-macbook:export-1"), true);
    assert.equal(restored.versions.length, sync.versions.length);
  });
});
