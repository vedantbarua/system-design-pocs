# Context Collab POC

Context Collab is a local-first proof-of-concept for sharing, merging, auditing, and reusing AI coding context across developers working on the same repository.

## Goal

Developers often build useful AI context in isolation: prompts, session transcripts, file references, debugging notes, decisions, failed attempts, patches, and follow-up plans. This POC turns that context into a structured collaboration artifact that can be committed, reviewed, merged, and exported into the next AI assistant session.

## What It Covers

- Repository-scoped context workspaces stored under `.context-collab`
- Portable context branch files with findings, assumptions, decisions, TODOs, file notes, risks, and prompt snippets
- CLI workflow for init, branch creation, context capture, session import, merge preview, accepted merge, and prompt export
- Local HTTP API over the same JSON storage
- Browser UI for timeline review, item entry, merge preview, conflict review, audit events, and bundle export
- Deterministic merge checks for duplicate findings, contradictory assumptions, overlapping file ownership, missing files, missing symbols, and base commit drift
- Provenance tracking for branch owner, item creator, source, confidence, affected files, and audit events

## Quick Start

```bash
cd context-collab-poc
npm test
npm run seed
npm run dev
```

Open:

```text
http://localhost:4100
```

The server uses the current project directory as the demo repository by default. To point it at another repository:

```bash
CONTEXT_COLLAB_REPO=/path/to/repo npm run dev
```

## CLI Flows

Initialize a repository workspace:

```bash
node src/cli.js init /path/to/repo --name "API Gateway"
```

Create personal context branches:

```bash
node src/cli.js branch --owner maya --name auth-routing --repo /path/to/repo
node src/cli.js branch --owner jordan --name rate-limit-fix --repo /path/to/repo
```

Add durable context items:

```bash
node src/cli.js add --repo /path/to/repo --branch maya-auth-routing --type finding --file src/router.ts "Route predicates are evaluated before auth policy lookup."
node src/cli.js add --repo /path/to/repo --branch jordan-rate-limit-fix --type patch-summary --file src/middleware/rate-limit.ts "Update rate limiting before expensive route checks."
```

Preview a merge:

```bash
node src/cli.js merge --repo /path/to/repo maya-auth-routing jordan-rate-limit-fix
```

Accept a merge and export a prompt bundle:

```bash
node src/cli.js merge --repo /path/to/repo maya-auth-routing jordan-rate-limit-fix --accept
node src/cli.js export --repo /path/to/repo --title "Merged auth routing context"
```

Import a generic session file:

```bash
node src/cli.js import-session ~/.codex/sessions/latest.jsonl --repo /path/to/repo --branch maya-auth-routing
```

## Demo Flows

### Flow 1: Share AI Context From One Developer

1. Initialize a workspace for a repository.
2. Create a branch such as `maya-auth-routing`.
3. Add findings, assumptions, decisions, TODOs, and affected file references.
4. Review the branch in the UI.
5. Export the branch or merge it into a shared bundle.

### Flow 2: Merge Context From Two Investigation Paths

1. Run `npm run seed` or create two branches manually.
2. Select both branches in the UI.
3. Click `Preview Merge`.
4. Review duplicate findings, contradictory assumptions, ownership collisions, and stale references.
5. Accept the merge and create a bundle.

### Flow 3: Build Individually From Shared Context

1. Create a bundle from the latest accepted merge.
2. Use the generated prompt block as the seed context for an AI coding session.
3. Continue privately.
4. Publish only durable new context items back into a branch.

### Flow 4: Build Together On One Problem

1. Multiple contributors create separate branches in the same `.context-collab` workspace.
2. Each branch keeps provenance for owner, source, confidence, file references, and timestamps.
3. The audit trail records workspace, branch, item, merge, and bundle events.
4. Accepted merge outputs become team-approved context bundles.

## JSON And HTTP API

### Local Files

```text
.context-collab/
  workspace.json
  audit.jsonl
  branches/
    maya-auth-routing.json
    jordan-rate-limit-fix.json
  merges/
    merge-*.json
  bundles/
    bundle-*.json
    bundle-*.prompt.md
```

### HTTP Endpoints

- `GET /api/health` - check server status and active repository root
- `GET /api/state` - fetch workspace, branches, merges, bundles, and audit events
- `POST /api/workspaces` - initialize a workspace
- `POST /api/branches` - create a context branch
- `POST /api/items` - add a context item to a branch
- `POST /api/merges/preview` - preview duplicate, conflict, and stale-reference checks
- `POST /api/merges` - accept a merge result and write merge audit data
- `POST /api/bundles` - create assistant-ready prompt and JSON bundle exports
- `POST /api/seed-demo` - create two demo branches, an accepted merge, and a bundle

Example merge preview request:

```json
{
  "sourceBranchIds": ["maya-auth-routing", "jordan-rate-limit-fix"]
}
```

## Configuration

```env
PORT=4100
CONTEXT_COLLAB_REPO=/path/to/repo
CONTEXT_COLLAB_DATA_DIR=.context-collab
```

## Five Implementation Phases

1. Local JSON storage and CLI workflow: workspace init, branch files, context items, session import, list, merge preview, and export.
2. Local API and web UI: browser workflow over the same storage for context entry, timeline review, merge preview, and bundle export.
3. Shared collaboration model: branch owner, source provenance, pull-like branch coexistence, accepted merge records, and append-only audit trail.
4. Context quality checks: deterministic duplicate detection, contradiction checks, stale file and symbol checks, ownership collisions, and assistant-ready bundle rendering.
5. Documentation and verification: seed data, Node test coverage, README, technical design notes, and prioritized improvement plan.

## Notes And Limitations

- The POC intentionally uses local JSON files instead of a database.
- The merge engine is deterministic and conservative; it flags review risks instead of attempting semantic truth.
- The session import adapter is generic and does not depend on one vendor's transcript format.
- The UI polls only on user actions; production realtime collaboration would use WebSockets or server-sent events.
- Context Collab is not a Git replacement. It is a companion layer for the reasoning and working context around code changes.

## Technologies Used

- Node.js
- Native `node:http` server
- Native `node:test` test runner
- Static HTML, CSS, and JavaScript
- Local JSON and JSONL storage
- Git metadata inspection through the local `git` CLI
