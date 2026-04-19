# Context Collab POC

Context Collab is a proof-of-concept for sharing, merging, and reusing AI coding context across developers working on the same repository or problem.

## Goal

Developers often build useful AI context in isolation: prompts, session transcripts, file references, debugging notes, decisions, failed attempts, patches, and follow-up plans. That context usually stays trapped inside one chat session or one person's local notes.

This POC turns AI working context into a shared collaboration artifact. A team can publish context from one session, pull context from another developer, merge competing context branches, and continue working individually or together with better continuity.

## What It Covers

- Repository-scoped context workspaces
- Portable AI session files as the core storage format
- Context branches for individual investigation paths
- Pull and merge workflows between users
- Conflict detection for contradictory assumptions, stale file references, and overlapping plans
- Provenance tracking for who added each context item and where it came from
- Context bundles that can be exported into an AI assistant prompt or local agent session
- Audit trail for context changes, merges, and accepted decisions

## Core Concept

The central object is a **context session file**. It is a structured file committed locally or synced through the app.

Example:

```json
{
  "workspaceId": "repo-api-gateway",
  "repository": {
    "name": "api-gateway",
    "remote": "git@github.com:team/api-gateway.git",
    "baseCommit": "8f2a91c"
  },
  "contextId": "ctx-auth-routing-investigation",
  "owner": "maya",
  "branch": "auth-routing",
  "items": [
    {
      "id": "item-001",
      "type": "finding",
      "summary": "Route predicates are evaluated before auth policy lookup.",
      "files": ["src/router/predicate-engine.ts"],
      "confidence": "high",
      "createdBy": "maya",
      "createdAt": "2026-04-19T16:30:00Z"
    }
  ]
}
```

The POC can store this as JSON for simplicity, then later move to JSONL for append-only event replay.

## Quick Start

This repository currently contains the product and technical plan for the POC. A runnable implementation can be built in phases from [PLAN.md](PLAN.md).

Suggested first implementation shape:

```bash
cd context-collab-poc
```

Planned local commands:

```bash
context-collab init /path/to/repo
context-collab capture --from-session ~/.codex/sessions/latest.jsonl
context-collab list
context-collab pull maya/auth-routing
context-collab merge maya/auth-routing jordan/rate-limit-fix
context-collab export --bundle merged-auth-routing
```

## Demo Flows

### Flow 1: Share AI Context From One Developer

1. A developer runs an AI coding session against a repository.
2. Context Collab imports the session transcript or structured notes.
3. The developer selects useful context items: findings, assumptions, decisions, files, TODOs, and patches.
4. The selected items are saved into a repository-scoped context branch.
5. Another developer pulls that branch into their workspace.

### Flow 2: Merge Context From Two Investigation Paths

1. Developer A investigates auth routing and records file-level findings.
2. Developer B investigates rate limiting and records a different plan.
3. The team merges both context branches.
4. The merge engine highlights duplicate findings, contradictory assumptions, and overlapping file ownership.
5. The accepted merge becomes a new context bundle.

### Flow 3: Build Individually From Shared Context

1. A developer exports the merged context bundle.
2. The bundle becomes the starting prompt or local session seed for an AI assistant.
3. The developer continues privately, then publishes only the useful new context back to the team.

### Flow 4: Build Together On One Problem

1. Multiple developers join the same repository workspace.
2. Each user contributes findings and decisions in near real time.
3. The shared context timeline shows what changed, who added it, and which files are affected.
4. The team pins accepted decisions so future AI sessions inherit the agreed direction.

## Planned API Surface

### Context Workspaces

- `POST /api/workspaces` - create a repository workspace
- `GET /api/workspaces` - list workspaces
- `GET /api/workspaces/{workspaceId}` - fetch workspace metadata

### Context Branches

- `POST /api/workspaces/{workspaceId}/branches` - create a context branch
- `GET /api/workspaces/{workspaceId}/branches` - list branches
- `GET /api/branches/{branchId}/items` - list context items
- `POST /api/branches/{branchId}/items` - add a context item

### Pull And Merge

- `POST /api/branches/{branchId}/pull` - pull another user's branch into the local workspace
- `POST /api/merges/preview` - preview a context merge and conflicts
- `POST /api/merges` - accept a merge result
- `GET /api/merges/{mergeId}` - inspect a completed merge

### Exports

- `POST /api/bundles` - create a curated context bundle
- `GET /api/bundles/{bundleId}` - fetch a bundle
- `GET /api/bundles/{bundleId}/prompt` - export assistant-ready prompt context
- `GET /api/bundles/{bundleId}/session-file` - export portable context session file

## Configuration

Planned configuration values:

```env
CONTEXT_COLLAB_DATA_DIR=.context-collab
CONTEXT_COLLAB_MAX_SESSION_BYTES=5000000
CONTEXT_COLLAB_DEFAULT_RELEVANCE_DAYS=14
CONTEXT_COLLAB_REQUIRE_BASE_COMMIT=true
CONTEXT_COLLAB_ENABLE_REALTIME=true
```

## Notes And Limitations

- The first version should not try to store every token from every AI chat. It should capture durable context: findings, decisions, assumptions, plans, and file references.
- Merge quality depends on structured context items. Raw transcripts can be attached, but they should not be the primary collaboration unit.
- The POC can start with local file storage and in-memory APIs before adding a database.
- Repository file references can become stale after code changes. The merge preview should detect base commit drift and missing files.
- This is not a replacement for Git. It is a companion layer for the reasoning and working context around code changes.

## Technologies Used

Recommended first implementation:

- Node.js or Spring Boot backend
- React frontend for workspace, timeline, merge preview, and bundle export
- Local JSON or SQLite storage
- WebSocket updates for shared context timelines
- Git metadata inspection for repository identity and base commit tracking

