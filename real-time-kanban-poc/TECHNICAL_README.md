# Technical README — Real-Time Kanban POC

## Overview
This POC demonstrates **real-time fan-out** from a Spring Boot backend to multiple React clients using WebSockets (STOMP over SockJS). REST endpoints mutate in-memory state; every mutation triggers a broadcast of the **full board snapshot** to all connected clients.

## Architecture

```
React (Viewer)
  -> POST/PUT/DELETE /api/tasks
  <- WS /topic/board (BoardSnapshot)

Spring Boot (Controller)
  -> updates in-memory state (TaskService)
  -> broadcasts snapshot (SimpMessagingTemplate)
```

### Backend
- Spring Boot 3.2 (Java 17)
- REST + WebSocket (STOMP)
- In-memory state only (no database)

### Frontend
- React 18 (Create React App)
- STOMP client with SockJS transport
- Live subscription to `/topic/board`

## Runtime Flow
1. Client calls REST to create/move/delete a task.
2. Backend updates `TaskService` in-memory map.
3. Backend broadcasts `BoardSnapshot` on `/topic/board`.
4. All connected clients receive the snapshot and re-render.

## Backend Details

### Endpoints
- `GET /api/board` → returns `BoardSnapshot`
- `GET /api/tasks` → returns list of tasks
- `POST /api/tasks` → create a task
- `PUT /api/tasks/{id}` → update title/description
- `PUT /api/tasks/{id}/move` → move to new status
- `DELETE /api/tasks/{id}` → remove task

### WebSocket
- Endpoint: `/ws` (SockJS)
- Topic: `/topic/board`
- Prefix: `/app` (reserved for future server-bound messages)

### Core Classes
- `TaskService` — in-memory store, thread-safe via `synchronized`
- `TaskController` — REST + broadcast coordination
- `WebSocketConfig` — STOMP broker + endpoint config

## Data Models

### Task
- `id: String`
- `title: String`
- `description: String`
- `status: TODO | IN_PROGRESS | DONE`
- `updatedAt: Instant`

### BoardSnapshot
- `tasks: List<Task>`
- `lastUpdated: Instant`

## Local Development

### Backend
```
cd /Users/vedantbarua/Desktop/Projects/system-design-pocs/real-time-kanban-poc/backend
mvn org.springframework.boot:spring-boot-maven-plugin:run
```

### Frontend
```
cd /Users/vedantbarua/Desktop/Projects/system-design-pocs/real-time-kanban-poc/frontend
npm install
npm start
```

## Notes
- This is an **event-broadcast** POC, not a persistence demo.
- The backend sends **full snapshots** to keep clients consistent.
- CORS is locked to `http://localhost:3000` for dev.
