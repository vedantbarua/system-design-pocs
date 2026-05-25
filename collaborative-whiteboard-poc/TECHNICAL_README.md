# Collaborative Whiteboard Technical README

## Problem Statement

This POC demonstrates a realtime collaborative canvas where multiple browser clients join the same named board, draw strokes, see participant presence, and receive cursor updates over WebSockets.

The central design question is how to keep a shared interactive surface responsive while giving every connected client a consistent enough view of board state. This implementation keeps the model intentionally simple: the server owns in-memory board state, clients send complete strokes after pointer release, and the server broadcasts state changes to other clients on the same board.

## Architecture Overview

The project has two runnable pieces:

- `backend`: Node.js, Express, and `ws`.
- `frontend`: React with Vite and an HTML canvas.

The backend owns the board registry:

- Each board is addressed by `boardId`.
- Each board stores an append-only `strokes` array.
- Each board tracks connected users in a `Map` keyed by generated client ID.
- REST endpoints expose health, board state, Swagger docs, and clear operations.
- WebSocket connections carry initialization, stroke, cursor, presence, and clear messages.

The frontend owns interaction and rendering:

- Canvas drawing is performed locally for immediate feedback.
- Finished strokes are sent to the backend as `stroke:add` messages.
- Remote strokes are appended to local state and redrawn.
- Cursor updates are throttled before being sent.
- Board ID, display name, and color are used to construct the WebSocket URL.

## Core Data Model

### Board

```json
{
  "id": "default",
  "strokes": [],
  "users": []
}
```

A board is created lazily the first time it is accessed. Board state is in memory and is lost when the backend restarts.

### Stroke

```json
{
  "id": "uuid",
  "points": [{ "x": 10, "y": 20 }],
  "color": "#2d7ff9",
  "width": 4,
  "author": "Guest-123",
  "createdAt": 1710000000000
}
```

The server validates that a stroke has at least two points. If a stroke is accepted, the server normalizes missing fields and appends it to the board.

### User

```json
{
  "id": "uuid",
  "name": "Guest-123",
  "color": "#2d7ff9"
}
```

Presence is derived from active WebSocket connections. Disconnecting removes the user from the board and broadcasts a new participant list.

## Request And Event Flow

### Join Flow

1. The client opens `/ws?boardId={id}&name={name}&color={color}`.
2. The server creates or loads the board.
3. The server generates a `clientId` and stores the socket in the board's user map.
4. The server sends an `init` message to the new client with board strokes, users, board ID, and client ID.
5. The server broadcasts `presence:update` to the other clients on the board.

### Drawing Flow

1. Pointer down creates a local current stroke.
2. Pointer move appends points and draws directly on the canvas for low-latency feedback.
3. Pointer move also sends throttled `cursor:update` messages.
4. Pointer up commits the stroke locally and sends `stroke:add`.
5. The server validates, normalizes, stores, and broadcasts the stroke to other board clients.
6. Remote clients append the stroke and redraw their canvas from local state.

### Clear Flow

1. A client sends `board:clear` over WebSocket or calls `POST /api/boards/:id/clear`.
2. The server replaces the board's stroke array with an empty array.
3. The server broadcasts `board:clear` to connected clients.
4. Clients clear their local stroke state and redraw the blank board.

## WebSocket Protocol

Client to server:

- `stroke:add`: append a completed stroke to the board.
- `cursor:update`: broadcast the sender's cursor position to other users.
- `board:clear`: clear all strokes for the current board.

Server to client:

- `init`: initial board state, users, board ID, and client ID.
- `stroke:add`: accepted stroke from another client.
- `cursor:update`: cursor position for another client.
- `presence:update`: current connected users for the board.
- `board:clear`: signal that the board has been reset.

The server broadcasts most events to all users on the same board except the sender. Clear events are broadcast to all connected users so every client converges on the empty board.

## REST API

- `GET /api/health`: process health and uptime.
- `GET /api/boards/:id`: current board strokes and connected users.
- `POST /api/boards/:id/clear`: clear a board and broadcast the reset.
- `GET /api/docs`: Swagger UI backed by `backend/openapi.json`.

In development, Vite proxies `/api` and `/ws` from `localhost:5174` to the backend on `localhost:8110`.

## Key Tradeoffs

- The server is authoritative for accepted strokes, but the local client draws immediately for perceived responsiveness.
- Strokes are sent only after completion, which keeps the protocol compact but means remote users see final strokes rather than live partial drawing.
- Cursor updates are live and throttled, giving collaboration feedback without sending every pointer event.
- The eraser is implemented as a stroke using the board background color, so it does not delete underlying vector objects.
- In-memory storage keeps the demo easy to understand but prevents durable recovery and horizontal scaling.

## Failure Handling

- Invalid JSON messages are ignored.
- Unknown message types are ignored.
- Stroke payloads without enough points are rejected.
- Cursor payloads without numeric coordinates are rejected.
- WebSocket disconnects remove the user from presence and notify remaining clients.
- Backend restart clears all boards because there is no persistence layer.

## Scaling Path

A production version would need to split state, fanout, and persistence concerns:

- Store boards and stroke history in a durable database or event log.
- Add board-level authorization and share links.
- Use Redis, NATS, or Kafka-backed pub/sub for multi-process WebSocket fanout.
- Add sequence numbers or operation IDs to make replay, deduplication, and reconnect recovery deterministic.
- Compact old strokes into raster snapshots or vector checkpoints for large boards.
- Move cursor/presence data to an ephemeral store with TTLs.
- Add backpressure controls for large boards and slow clients.

## What Is Intentionally Simplified

- No authentication, authorization, or private boards.
- No persistence or replay after restart.
- No CRDT or operational-transform layer for concurrent object edits.
- No per-stroke undo, object selection, shape tools, comments, or history browser.
- No rate limiting or abuse controls.
- No automated test suite yet for WebSocket messages, REST endpoints, or canvas behavior.
