# Context Collab Technical README

## Problem Statement

AI coding context is high-value but usually trapped inside individual chat sessions. Teams need a way to capture durable context, compare parallel investigations, detect context conflicts, and export agreed context into future AI sessions without storing every token of raw conversation.

## Architecture Overview

The POC is local-first. A repository gets a `.context-collab` directory containing workspace metadata, branch snapshots, accepted merge records, prompt bundles, and an append-only audit log.

```text
CLI commands
    |
    v
src/lib/store.js  <---->  .context-collab JSON and JSONL files
    ^
    |
HTTP API and static UI
```

The CLI and web server both call the same storage library, so the terminal workflow and browser workflow stay consistent.

## Core Data Model

### Workspace

`workspace.json` stores repository identity, root path, remote, default branch, base commit, current head, and timestamps.

### Context Branch

Each file under `branches/` represents one investigation path. A branch has an owner, name, base commit, optional parent branch, timestamps, and an ordered list of context items.

### Context Item

Items are typed durable context units. Supported types are `finding`, `assumption`, `decision`, `todo`, `risk`, `question`, `patch-summary`, `file-note`, and `prompt-snippet`.

Each item includes summary, body, files, symbols, confidence, source, creator, timestamp, and optional supersedes metadata.

### Merge Preview

A merge preview is computed from source branches. It contains accepted items, duplicate candidates, conflicts, stale references, and generation time.

### Context Bundle

A bundle is the export artifact. It stores included items and generated Markdown prompt text for a future assistant session.

## Request And Event Flow

1. `initWorkspace` creates `.context-collab`, writes `workspace.json`, and records `workspace.initialized`.
2. `createBranch` writes a branch snapshot and records `branch.created`.
3. `addItem` appends to the branch snapshot and records `item.added`.
4. `previewMerge` reads branches and computes duplicate, contradiction, ownership, missing-file, missing-symbol, and base-commit checks.
5. `acceptMerge` persists the preview as an accepted merge and records `merge.accepted`.
6. `createBundle` renders accepted items into prompt Markdown, writes JSON and `.prompt.md`, and records `bundle.created`.

## Merge Checks

Duplicate detection compares item type, normalized summary, token overlap, and file overlap.

Contradiction detection looks for positive and negative intent across assumptions, decisions, TODOs, and patch summaries that touch the same file.

Ownership collision detection flags TODOs and patch summaries from different creators that plan work on the same file.

Stale reference detection checks branch base commit drift, missing files, and missing symbols inside referenced files.

## Key Tradeoffs

- JSON files are readable, diffable, and simple, but they are not safe for concurrent writes from many processes.
- Deterministic conflict checks are explainable, but they miss nuanced semantic contradictions.
- Snapshot branch files are easy to inspect, but append-only event replay would be better for conflict recovery.
- A static UI keeps the POC dependency-free, but a larger product would likely use React and realtime events.

## Failure Handling

- Missing workspace state returns a clear initialization error.
- Unsupported item types are rejected.
- Merge preview does not mutate state, so failed previews are safe.
- Accepted merges and bundles are written as separate artifacts.
- Audit events are append-only JSONL, so event history survives branch snapshot changes.

## Scaling Path

1. Move branch, item, merge, bundle, and audit storage to SQLite for local durability.
2. Add optimistic concurrency with branch revision numbers.
3. Add a shared server mode backed by Postgres.
4. Add WebSocket or server-sent event updates for shared timelines.
5. Add semantic summarization and conflict detection through an LLM adapter.
6. Add signed bundle exports and review states for accepted team context.

## What Is Intentionally Simplified

- No authentication or multi-tenant authorization.
- No remote sync service.
- No automatic code changes.
- No deep vendor-specific transcript parser.
- No semantic embedding store.
- No realtime collaboration transport.
