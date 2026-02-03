# Collaborative Whiteboard (Canvas/Figma) POC
Realtime collaborative canvas using Node + Express + WebSocket and a React frontend. The backend keeps all board state in memory.

## What this POC shows
- Live drawing sync across multiple clients
- Presence + cursor streaming
- Multiple boards via query parameter
- In-memory board state (no persistence)

## How to Run
1. Backend

```bash
cd system-design-pocs/collaborative-whiteboard-poc/backend
npm install
npm run dev
```

Backend runs on `http://localhost:8110`.

2. Frontend

```bash
cd system-design-pocs/collaborative-whiteboard-poc/frontend
npm install
npm run dev
```

Frontend runs on `http://localhost:5174` and proxies `/api` + `/ws` to the backend.

## Usage
- Open multiple tabs to see realtime sync.
- Change the board name in the left panel to create a new board (also reflected in `?board=`).
- Use the eraser tool to draw with the board background color.

## API
- `GET /api/health`
- `GET /api/boards/:id`
- `POST /api/boards/:id/clear`
- Swagger UI: `http://localhost:8110/api/docs`

## Notes
- Board state is in memory only; restarting the backend clears all boards.
