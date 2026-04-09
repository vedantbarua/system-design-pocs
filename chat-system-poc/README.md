# Chat System POC

Multi-room chat proof-of-concept built with Spring Boot, Thymeleaf, and an in-memory message store. It is intentionally simple, but it still demonstrates the core building blocks of a chat product: room lifecycle, bounded history, and a clean split between UI routes and JSON endpoints.

## Why This POC Matters

Chat systems look easy until message retention, room management, and client access patterns start to matter. This project keeps the scope small while still showing the basic backend shape of a messaging system.

## What It Covers

- Create named rooms with optional topics
- Post messages with sender names
- Keep only the most recent messages per room to bound memory
- Browse rooms in a server-rendered UI
- Access the same room and message data through JSON APIs

## Quick Start

```bash
cd chat-system-poc
mvn org.springframework.boot:spring-boot-maven-plugin:run
```

Open `http://localhost:8083`.

## Demo Flow

1. Open the default `general` room.
2. Create a second room with a topic.
3. Post messages from a few different sender names.
4. Open the JSON endpoints to compare the API view with the HTML view.

## Endpoints

- `GET /` lists rooms and provides the create-room form
- `GET /rooms/{room}` shows room history and the message form
- `GET /api/rooms` returns the room list as JSON
- `GET /api/rooms/{room}` returns room details
- `GET /api/rooms/{room}/messages` returns room message history
- `POST /api/rooms` creates a room with `name` and `topic`
- `POST /api/rooms/{room}/messages` posts a message with `sender` and `content`

## Design Notes

- Room data is stored in a concurrent map.
- Each room keeps a bounded deque so message history does not grow forever.
- The service seeds a `general` room so the app has a useful starting state.

## Limitations

- No realtime fanout
- No persistence
- No delivery guarantees, presence, or typing indicators
- Everything resets on restart

## Technologies

- Spring Boot 3.2
- Java 17
- Thymeleaf
- In-memory collections

## Related Docs

- [TECHNICAL_README.md](TECHNICAL_README.md)
- [IMPROVEMENTS.md](IMPROVEMENTS.md)
