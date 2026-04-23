import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  acceptMerge,
  addItem,
  createBranch,
  createBundle,
  importSessionContent,
  initWorkspace,
  pullBranch,
  previewMerge
} from "../src/lib/store.js";

function tempRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "context-collab-"));
  fs.writeFileSync(path.join(dir, "README.md"), "# Demo\n\nroute predicates\n");
  return dir;
}

test("previewMerge detects duplicates, contradictions, ownership collisions, and stale files", () => {
  const repo = tempRepo();
  initWorkspace(repo, { name: "demo" });
  const maya = createBranch(repo, { owner: "maya", name: "auth-routing", baseCommit: "abc123" });
  const jordan = createBranch(repo, { owner: "jordan", name: "rate-limit", baseCommit: "abc123" });

  addItem(repo, maya.branchId, {
    type: "finding",
    summary: "Route predicates are evaluated before auth policy lookup.",
    files: ["README.md"],
    confidence: "high"
  });
  addItem(repo, jordan.branchId, {
    type: "finding",
    summary: "Route predicates are evaluated before auth policy lookup.",
    files: ["README.md"],
    confidence: "high"
  });
  addItem(repo, maya.branchId, {
    type: "assumption",
    summary: "Do not modify the rate limit middleware.",
    files: ["src/middleware/rate-limit.ts"]
  });
  addItem(repo, jordan.branchId, {
    type: "patch-summary",
    summary: "Update the rate limit middleware before route checks.",
    files: ["src/middleware/rate-limit.ts"]
  });
  addItem(repo, maya.branchId, {
    type: "todo",
    summary: "Update README with routing notes.",
    files: ["README.md"]
  });
  addItem(repo, jordan.branchId, {
    type: "todo",
    summary: "Update README with export notes.",
    files: ["README.md"]
  });

  const preview = previewMerge(repo, [maya.branchId, jordan.branchId]);

  assert.equal(preview.duplicateItems.length, 1);
  assert.ok(preview.conflicts.some((conflict) => conflict.type === "contradiction"));
  assert.ok(preview.conflicts.some((conflict) => conflict.type === "ownership-collision"));
  assert.ok(preview.staleReferences.some((reference) => reference.type === "missing-file"));
  assert.ok(preview.acceptedItems.length < 6);
});

test("accepted merge can be exported as assistant-ready prompt bundle", () => {
  const repo = tempRepo();
  initWorkspace(repo, { name: "demo" });
  const branch = createBranch(repo, { owner: "maya", name: "auth" });
  addItem(repo, branch.branchId, {
    type: "decision",
    summary: "Keep context bundles concise.",
    files: ["README.md"],
    confidence: "high"
  });

  const merge = acceptMerge(repo, [branch.branchId]);
  const bundle = createBundle(repo, { mergeId: merge.mergeId, title: "Demo Bundle" });

  assert.equal(bundle.sourceMergeId, merge.mergeId);
  assert.match(bundle.promptText, /Keep context bundles concise/);
  assert.match(bundle.promptText, /## Context Items/);
});

test("importSessionContent normalizes pasted jsonl and plain text into context items", () => {
  const repo = tempRepo();
  initWorkspace(repo, { name: "demo" });
  const branch = createBranch(repo, { owner: "maya", name: "imports" });

  const imported = importSessionContent(
    repo,
    branch.branchId,
    '{"message":"Auth runs after predicate parsing"}\nplain text line from session\n',
    { source: "session:web-ui", format: "jsonl" }
  );

  assert.equal(imported.length, 2);
  assert.equal(imported[0].type, "prompt-snippet");
  assert.match(imported[0].summary, /Auth runs after predicate parsing/);
  assert.match(imported[1].summary, /plain text line/);
});

test("pullBranch clones another user's branch into a new owner branch", () => {
  const repo = tempRepo();
  initWorkspace(repo, { name: "demo" });
  const source = createBranch(repo, { owner: "maya", name: "auth-routing" });
  addItem(repo, source.branchId, {
    type: "finding",
    summary: "Routing context should be preserved for collaborators.",
    files: ["README.md"]
  });

  const pulled = pullBranch(repo, source.branchId, { owner: "jordan", name: "auth-routing-copy" });

  assert.equal(pulled.owner, "jordan");
  assert.equal(pulled.parentBranchId, source.branchId);
  assert.equal(pulled.items.length, 1);
  assert.equal(pulled.items[0].source, `pull:${source.branchId}`);
  assert.equal(pulled.items[0].createdBy, "jordan");
});
