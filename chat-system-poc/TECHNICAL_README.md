# Technical README: Chat System POC

This document explains the architecture, flow, and file-by-file purpose of the chat proof-of-concept.

## Architecture Overview
- **Framework**: Spring Boot 3.2 with MVC and Thymeleaf for server-rendered UI.
- **Storage**: In-memory `ConcurrentHashMap` of rooms; each room holds an `ArrayDeque` of the most recent messages (cap configured via `app.max-messages`).
- **Domain**: `ChatRoom` tracks name/topic/createdAt. `ChatMessage` holds sender/content/timestamp.
- **Service**: `ChatRoomService` manages room lifecycle, message posting, trimming to the configured cap, and a default `general` room.
- **Controllers**: `ChatController` renders pages and handles form posts; `ChatApiController` exposes JSON endpoints for rooms/messages.
- **Views**: `home.html` lists rooms and creation form; `room.html` shows messages and a post form.

## File Structure
```
chat-system-poc/
├── pom.xml                                      # Maven configuration (Spring Boot, Thymeleaf, validation)
├── src/main/java/com/randomproject/chatsystem/
│   ├── ChatSystemPocApplication.java             # Boots the Spring application
│   ├── ChatRoom.java                             # Domain model for a chat room
│   ├── ChatMessage.java                          # Domain model for a chat message
│   ├── ChatRoomService.java                      # In-memory store + message trimming + defaults
│   ├── ChatController.java                       # MVC controller for pages/forms
│   ├── ChatApiController.java                    # REST endpoints for rooms and messages
│   ├── CreateRoomRequest.java                    # Validation-backed payload for creating rooms
│   └── ChatMessageRequest.java                   # Validation-backed payload for posting messages
└── src/main/resources/
    ├── application.properties                    # Port + max message cap + Thymeleaf dev config
    └── templates/
        ├── home.html                             # Rooms list + creation form
        └── room.html                             # Chat room view and message form
```

## Flow
1. **Home**: GET `/` renders `home.html` with existing rooms and the create-room form.
2. **Create room**: POST `/rooms` validates input, creates the room via `ChatRoomService`, and redirects to `/rooms/{room}`.
3. **View room**: GET `/rooms/{room}` fetches messages (capped to the newest N) and renders `room.html`.
4. **Post message**: POST `/rooms/{room}/message` validates sender/content, appends to the deque, trims if over cap, and redirects back.
5. **API**: `/api/rooms`, `/api/rooms/{room}`, `/api/rooms/{room}/messages`, and POST variants expose the same data as JSON.

## Notable Implementation Details
- **Message cap**: `app.max-messages` (default 200) limits messages per room; oldest messages drop first to keep memory bounded.
- **Thread safety**: Rooms map is concurrent; per-room message deque is guarded with `synchronized` to avoid concurrent mutations.
- **Default room**: Service constructor seeds a `general` room so the UI always has a destination.
- **Validation**: `jakarta.validation` annotations ensure room names and messages are non-empty with sensible length limits.
- **Encoding**: Room redirects encode path segments to safely handle names with spaces or casing.

## Configuration
- `server.port=8083` — avoid clashing with other POCs.
- `spring.thymeleaf.cache=false` — reload templates during development.
- `app.max-messages=200` — cap per-room message history.

## Build/Run
- `mvn org.springframework.boot:spring-boot-maven-plugin:run`
