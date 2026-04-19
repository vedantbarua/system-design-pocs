# Context Collab POC Plan

## Product Thesis

AI coding sessions create valuable working context, but that context is fragmented across chat windows, local notes, commit messages, and individual memory. Context Collab treats AI context as a first-class collaborative artifact that can be shared, merged, reviewed, and reused.

The POC should prove one thing clearly: a team can move faster when AI context is portable, structured, and mergeable.

## Target Users

- Developers working on the same repository
- Tech leads coordinating parallel investigation paths
- AI-heavy teams that repeatedly lose context between sessions
- Pairing or swarm teams solving one incident, refactor, bug, or architecture change

## POC Scope

### In Scope

- Create repository-scoped context workspaces
- Import context from a session file or manual context item entry
- Represent context as structured items with type, provenance, confidence, files, and timestamps
- Support personal context branches
- Pull context branches from other users
- Preview and accept context merges
- Export merged context into an AI-ready prompt bundle
- Show conflicts around stale files, contradictory statements, duplicate findings, and overlapping plans

### Out Of Scope

- Full multi-tenant SaaS auth
- Deep LLM-based semantic conflict resolution in the first pass
- Automatic code modification
- Replacing Git branches or pull requests
- Storing complete raw transcripts as the main source of truth
- IDE plugin support in the first implementation

## Success Criteria

- A developer can initialize a context workspace for a local repository.
- A developer can import or create context items.
- Two users can maintain separate context branches.
- One user can pull another user's context branch.
- The system can preview a merge and flag at least three conflict types.
- The merged bundle can be exported as a concise assistant-ready context block.
- The README demo flow can be completed locally without external services.

## Core Data Model

### Workspace

Represents one repository or problem space.

Fields:

- `workspaceId`
- `name`
- `repositoryRemote`
- `repositoryRoot`
- `defaultBranch`
- `createdAt`

### Context Branch

Represents one user's evolving AI context path.

Fields:

- `branchId`
- `workspaceId`
- `name`
- `owner`
- `baseCommit`
- `parentBranchId`
- `createdAt`
- `updatedAt`

### Context Item

Represents one durable unit of AI or developer context.

Types:

- `finding`
- `assumption`
- `decision`
- `todo`
- `risk`
- `question`
- `patch-summary`
- `file-note`
- `prompt-snippet`

Fields:

- `itemId`
- `branchId`
- `type`
- `summary`
- `body`
- `files`
- `symbols`
- `confidence`
- `source`
- `createdBy`
- `createdAt`
- `supersedes`

### Merge Preview

Represents a proposed context merge before it is accepted.

Fields:

- `mergeId`
- `sourceBranchIds`
- `targetBranchId`
- `acceptedItems`
- `duplicateItems`
- `conflicts`
- `staleReferences`
- `generatedAt`

### Context Bundle

Represents curated context ready to send into an AI assistant.

Fields:

- `bundleId`
- `workspaceId`
- `sourceMergeId`
- `title`
- `summary`
- `includedItems`
- `promptText`
- `createdAt`

## Session File Format

Use a local `.context-collab/session.json` file for the first version. Keep it readable and diffable.

Proposed layout:

```text
.context-collab/
  workspace.json
  branches/
    maya-auth-routing.context.json
    jordan-rate-limit.context.json
  merges/
    merge-2026-04-19-auth-routing.json
  bundles/
    bundle-auth-routing.prompt.md
```

First version can use snapshot JSON. Later versions can move to append-only JSONL:

```jsonl
{"event":"context.item.added","itemId":"item-001","type":"finding","summary":"..."}
{"event":"context.item.superseded","itemId":"item-001","supersededBy":"item-009"}
{"event":"context.merge.accepted","mergeId":"merge-001"}
```

## Merge Rules

### Duplicate Detection

Flag two items as likely duplicates when:

- Same type
- Same normalized summary or high token overlap
- Same file references
- Same source session import

### Contradiction Detection

Flag possible contradictions when:

- Two assumptions mention the same file or symbol but state incompatible behavior
- One decision supersedes another without an explicit `supersedes` link
- One plan says to modify a file while another says the same file is intentionally out of scope

### Stale Reference Detection

Flag stale context when:

- `baseCommit` does not match current repository HEAD
- Referenced files no longer exist
- Referenced symbols cannot be found with a text search

### Ownership Collision Detection

Flag overlapping work when:

- Multiple branches plan edits to the same file
- Multiple patch summaries touch the same module
- Two TODOs assign different owners to the same task

## User Experience Plan

### CLI First

The fastest useful POC is a CLI because context capture and export are developer-local workflows.

Commands:

```bash
context-collab init
context-collab import-session <path>
context-collab add --type finding --file src/router.ts "Routing happens before auth"
context-collab branches
context-collab pull <user>/<branch>
context-collab merge <branch-a> <branch-b>
context-collab export <bundle-id>
```

### Web UI Second

The web UI should make collaboration and conflict review obvious.

Screens:

- Workspace overview
- Context timeline
- Branch comparison
- Merge preview
- Bundle export

UI signals:

- Context item type badges
- File reference chips
- Confidence indicators
- Conflict cards
- Provenance and timeline history

## Architecture Plan

### Phase 1: Local-Only CLI

Build a CLI that reads and writes `.context-collab` files inside a repository.

Deliverables:

- `init`
- `add`
- `list`
- `import-session`
- `export`
- Basic merge preview between local branch files

Why this phase matters:

- Proves the session file model
- Avoids backend complexity
- Makes the core workflow useful quickly

### Phase 2: Local API And Web UI

Add an API server and UI over the same local storage.

Deliverables:

- REST API for workspaces, branches, items, merges, and bundles
- Timeline UI
- Merge preview UI
- Prompt export UI

Why this phase matters:

- Makes collaboration state visible
- Helps review merge conflicts without reading JSON

### Phase 3: Shared Collaboration Server

Move storage to SQLite or Postgres and add realtime branch updates.

Deliverables:

- User identity
- Shared workspace sync
- WebSocket timeline updates
- Pull branch from another user
- Merge acceptance audit trail

Why this phase matters:

- Demonstrates real multi-user collaboration
- Separates local context from shared team context

### Phase 4: AI-Assisted Context Quality

Use an LLM to summarize raw sessions, classify context items, and detect semantic conflicts.

Deliverables:

- Session transcript summarizer
- Context item classifier
- Semantic duplicate detector
- Assistant-ready bundle generation

Why this phase matters:

- Reduces manual cleanup
- Makes exported context concise enough for real AI use

## Implementation Recommendation

Start with a Node.js CLI and local JSON files because it matches the session-file-first idea and keeps iteration fast.

Recommended stack:

- Node.js
- Commander for CLI commands
- Zod for schema validation
- SQLite when moving beyond JSON files
- Express for API phase
- React for UI phase

Alternative stack:

- Spring Boot for API-first implementation if the goal is to match most Java POCs in this repository.

## Risks And Mitigations

### Risk: Context Becomes A Dumping Ground

Mitigation:

Require typed items, confidence, source, and optional file references. Keep raw transcripts as attachments, not primary context.

### Risk: Merge Conflicts Are Too Subjective

Mitigation:

Start with deterministic checks: duplicates, same files, stale references, explicit supersedes links, and owner collisions.

### Risk: Exported Context Is Too Large

Mitigation:

Support bundle curation and relevance filters by type, confidence, file path, owner, and recency.

### Risk: Session File Formats Differ Across AI Tools

Mitigation:

Define Context Collab's own normalized schema. Treat imported sessions as adapters.

## Milestone Checklist

- [ ] Define JSON schema for workspace, branch, item, merge, and bundle files
- [ ] Build local `init`, `add`, `list`, and `export` commands
- [ ] Add session import adapter for one local AI session format
- [ ] Implement deterministic merge preview
- [ ] Add stale file reference checks using Git metadata and filesystem lookups
- [ ] Create assistant-ready bundle export
- [ ] Add REST API over local storage
- [ ] Build timeline and merge preview UI
- [ ] Add shared server mode
- [ ] Add AI-assisted summarization and semantic conflict detection

## Open Questions

- Should context branches map directly to Git branches, or should they be independent?
- Should accepted context bundles be committed into the repository?
- How much raw transcript should be retained for auditability?
- Should context items support review states such as proposed, accepted, rejected, and superseded?
- What is the minimum useful import adapter: Codex session file, Claude transcript, Cursor chat export, or generic Markdown?

