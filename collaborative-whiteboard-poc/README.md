# Collaborative Whiteboard POC

Realtime collaborative canvas built with a Node + Express backend, WebSocket synchronization, and a React frontend. The backend keeps board state in memory and streams drawing activity, which makes the project a clean demonstration of multi-client state sharing.

## Why This POC Matters

Collaborative tools get difficult as soon as multiple clients need to see the same state with low latency. This project focuses on that core problem directly: shared canvas state, cursor and presence updates, and separate boards identified by name.

## What It Covers

- Live drawing synchronization across clients
- Presence and cursor streaming
- Multiple named boards through query parameters and the side panel
- Backend APIs for health checks, board fetches, and clear operations
- Swagger documentation for the backend API

## Run It Locally

### Backend

```bash
cd collaborative-whiteboard-poc/backend
npm install
npm run dev
```

Backend runs on `http://localhost:8110`.

### Frontend

```bash
cd collaborative-whiteboard-poc/frontend
npm install
npm run dev
```

Frontend runs on `http://localhost:5174`.

## Demo Flow

1. Open the frontend in two browser windows.
2. Draw on one canvas and confirm the second client updates immediately.
3. Change the board name to create or join a different board.
4. Use the clear action and verify all connected clients see the reset.

## API Surface

- `GET /api/health`
- `GET /api/boards/:id`
- `POST /api/boards/:id/clear`
- Swagger UI: `http://localhost:8110/api/docs`

## Design Notes

- The frontend proxies `/api` and `/ws` to the backend in development.
- State is kept in memory, which makes board switching and websocket fanout easy to follow.
- The eraser works by drawing with the board background color rather than deleting vector objects.

## Limitations

- No persistence
- No CRDT or OT conflict-resolution layer
- No auth or board permissions
- Restarting the backend clears all board state
