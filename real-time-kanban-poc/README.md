# Real-Time Kanban-Style Dashboard POC

This proof-of-concept focuses on **live communication between layers**.

- **Java (Spring Boot)** acts as the traffic controller and broadcasts every task change over WebSockets.
- **React** acts as the active viewer and updates the UI instantly when the backend pushes a change.

## Architecture

- REST is used for mutations (create/move/delete)
- WebSocket (STOMP) is used for real-time broadcasts
- No database: in-memory state only, to emphasize event flow

```
React (Viewer)
  -> POST/PUT/DELETE /api/tasks
  <- WS /topic/board (full board snapshot)

Spring Boot (Controller)
  -> updates in-memory state
  -> broadcasts snapshot to all connected clients
```

## How to Run

### 1) Backend (Spring Boot)

```
cd /Users/vedantbarua/Desktop/Projects/system-design-pocs/real-time-kanban-poc/backend
mvn org.springframework.boot:spring-boot-maven-plugin:run
```

Backend runs on `http://localhost:8080`.

### 2) Frontend (React)

```
cd /Users/vedantbarua/Desktop/Projects/system-design-pocs/real-time-kanban-poc/frontend
npm install
npm start
```

Frontend runs on `http://localhost:3000`.

## Key Endpoints

- `GET /api/board` → full board snapshot
- `POST /api/tasks` → create a task
- `PUT /api/tasks/{id}` → update title/description
- `PUT /api/tasks/{id}/move` → move to a new status
- `DELETE /api/tasks/{id}` → remove a task

## WebSocket

- Endpoint: `/ws` (SockJS)
- Topic: `/topic/board`

Every mutation results in a **new board snapshot** broadcast to all clients.
