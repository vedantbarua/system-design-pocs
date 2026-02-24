# Real-Time Sync Engine POC

This proof-of-concept shows how multiple users can edit the **same document** at the same time without conflicts.

- **React frontend** provides a shared text surface.
- **Node.js/Express + Socket.io** relays updates in real time.
- **CRDT (Yjs Text)** guarantees convergence even with concurrent edits.

## Architecture

```
React (Editor)
  -> emits CRDT updates over Socket.io
  <- receives CRDT updates from others

Node.js/Express (Traffic Controller)
  -> keeps a shared Yjs document in memory
  -> rebroadcasts updates to all connected clients
```

## How to Run

### 1) Backend

```
cd /Users/vedantbarua/Desktop/Projects/system-design-pocs/real-time-sync-engine-poc/backend
npm install
npm run dev
```

Backend runs on `http://localhost:4000`.

### 2) Frontend

```
cd /Users/vedantbarua/Desktop/Projects/system-design-pocs/real-time-sync-engine-poc/frontend
npm install
npm run dev
```

Frontend runs on `http://localhost:3000`.

## What to Try

- Open two tabs and type simultaneously.
- Disconnect one tab, type in the other, then reconnect.
- Paste larger blocks to see batched CRDT updates.

## API

- `GET /health` -> server health
- `GET /doc` -> current document snapshot
