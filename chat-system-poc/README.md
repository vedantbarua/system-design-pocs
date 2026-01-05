# Chat System POC

Lightweight multi-room chat built with Spring Boot, Thymeleaf, and an in-memory store. Create rooms, drop messages, and read history — everything resets on restart.

## Features
- Create named chat rooms with optional topics
- Post messages with sender names; keeps the latest 200 messages per room
- Simple web UI for rooms plus JSON endpoints for automation
- Ships with a default `general` room to jump in quickly

## Quick Start
1. Ensure Java 17+ and Maven are installed.
2. Run the app:
   ```bash
   cd chat-system-poc
   mvn org.springframework.boot:spring-boot-maven-plugin:run
   ```
3. Open `http://localhost:8083` for the UI.

## Endpoints
- `/` — List rooms and create a new one
- `/rooms/{room}` — View messages in a room and post a new message
- `/api/rooms` — JSON list of rooms
- `/api/rooms/{room}` — Room details as JSON
- `/api/rooms/{room}/messages` — Messages for a room
- `/api/rooms` `POST` — Create room (`name`, `topic`)
- `/api/rooms/{room}/messages` `POST` — Post message (`sender`, `content`)

## Technologies
- Spring Boot 3.2 (web + Thymeleaf + validation)
- Java 17
- In-memory store (ConcurrentHashMap + ArrayDeque)
