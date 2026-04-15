# Bar Menu POC

Spring Boot proof-of-concept for a bar menu with drink recipes, active prep sessions, and a live step-by-step helper.

## Goal

Demonstrate how a menu-driven ordering surface can create stateful preparation workflows. Each selected drink becomes a helper session that tracks the current step, progress, status, and recent events.

## What It Covers

- Drink catalog with ingredients, glassware, category, and recipe steps
- Stateful helper sessions for each started drink
- Step transitions for next, back, and reset
- Recent workflow event log
- UI and JSON API backed by the same in-memory service

## Quick Start

1. Ensure Java 17+ and Maven are installed.
2. Run the app:
   ```bash
   cd bar-menu-poc
   mvn org.springframework.boot:spring-boot-maven-plugin:run
   ```
3. Open `http://localhost:8096`.

## UI Flows

- Browse the menu and choose a drink.
- Start a helper session from any drink card.
- Use Next, Back, and Reset to move through recipe steps.
- Watch active sessions and recent workflow events update.
- Switch between active drink helpers from the session list.

## JSON Endpoints

- `GET /api/drinks` - list menu drinks
- `GET /api/sessions` - list prep helper sessions
- `POST /api/sessions` - start a helper
  ```json
  { "drinkId": "margarita" }
  ```
- `GET /api/sessions/{id}` - inspect one helper session
- `POST /api/sessions/{id}/advance` - move to the next step
- `POST /api/sessions/{id}/back` - move to the previous step
- `POST /api/sessions/{id}/reset` - restart the helper at step one
- `GET /api/events` - list recent workflow events

## Configuration

- `server.port=8096`
- Data is in memory and resets on restart.

## Notes and Limitations

- Recipes are seeded in code for a compact POC.
- Session IDs are short UUID prefixes, not durable production identifiers.
- The live helper uses lightweight polling rather than WebSockets or SSE.
- No authentication, persistence, inventory tracking, or payment flow is included.

## Technologies Used

- Java 17
- Spring Boot 3.2
- Spring Web
- Thymeleaf
- Bean Validation
