# Technical Notes: Real-Time Sync Engine

## CRDT Choice

This POC uses **Yjs Text**, a CRDT designed for collaborative editing. Yjs guarantees:

- **Convergence**: all replicas reach the same state.
- **Intention preservation**: concurrent edits merge predictably.
- **No global locks**: every client can edit immediately.

## Data Flow

1. Client opens a Socket.io connection.
2. Server sends a full document update (`sync:init`).
3. Client applies the update locally.
4. Local edits generate Yjs updates (binary deltas).
5. Client sends updates to server (`doc:update`).
6. Server applies updates to its in-memory Yjs document.
7. Server broadcasts the same update to all other clients.

## Event Types

- `sync:init`: full document update when a client connects.
- `doc:update`: incremental CRDT update for each edit.

## Why Not OT Here?

Operational Transformation (OT) is also viable but is more complex to implement correctly in a POC. A CRDT keeps the server dumb (relay-only) and still guarantees convergence.

## Limitations (Intentional)

- In-memory document only (no persistence).
- Single room / single document.
- No authentication or presence data.

## Suggested Extensions

- Add multiple rooms (documents) keyed by ID.
- Persist Yjs updates to a database.
- Implement presence and cursor sharing (Awareness protocol).
- Support file imports and structured blocks.
