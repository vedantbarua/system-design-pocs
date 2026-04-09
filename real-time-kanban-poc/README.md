# Real-Time Kanban POC

Kanban-style task board that uses Spring Boot for mutation handling and WebSocket fanout, with a React client that updates live as the backend pushes new board snapshots. The project is small, but it demonstrates a useful realtime pattern clearly: REST for writes, websocket broadcast for state distribution.

## Why This POC Matters

Many collaborative products start with CRUD and only later become hard when multiple clients need to stay in sync. This POC isolates that problem and shows one pragmatic solution: keep state in memory, accept mutations over REST, and broadcast a fresh snapshot after every change.

## What It Covers

- Create, edit, move, and delete tasks
- Broadcast full board snapshots to all connected clients
- Use REST for task mutations and WebSocket for synchronization
- Show how a simple board can stay consistent across multiple open clients

## Run It Locally

### Backend

```bash
cd real-time-kanban-poc/backend
mvn org.springframework.boot:spring-boot-maven-plugin:run
```

Backend runs on `http://localhost:8080`.

### Frontend

```bash
cd real-time-kanban-poc/frontend
npm install
npm start
```

Frontend runs on `http://localhost:3000`.

## Demo Flow

1. Open the UI in two browser tabs.
2. Create a task in the first tab.
3. Move or edit the task and watch the second tab update immediately.
4. Delete a task and confirm both clients stay aligned.

## API Surface

- `GET /api/board` returns the full board snapshot
- `GET /api/tasks` returns all tasks
- `POST /api/tasks` creates a task
- `PUT /api/tasks/{id}` updates title or description
- `PUT /api/tasks/{id}/move` moves a task to a new status
- `DELETE /api/tasks/{id}` removes a task

## WebSocket

- Endpoint: `/ws`
- Topic: `/topic/board`
- Transport: STOMP over SockJS

## Design Notes

- The backend broadcasts full snapshots instead of diffs to keep clients simple and consistent.
- State is stored in memory so the example can focus on realtime flow rather than database coordination.
- This pattern maps well to early-stage collaborative tools before conflict resolution becomes necessary.

## Limitations

- No persistence
- No auth or multi-tenant separation
- Snapshot broadcast instead of fine-grained event streams
- No offline or conflict-resolution logic

## Related Docs

- [TECHNICAL_README.md](TECHNICAL_README.md)
