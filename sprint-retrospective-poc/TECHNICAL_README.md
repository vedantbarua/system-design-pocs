# Technical README: Sprint Retrospective POC

This document explains the architecture, flow, and file-by-file purpose of the sprint retrospective proof-of-concept.

## Architecture Overview
- **Framework**: Spring Boot 3.3 REST API + Create React App UI.
- **Storage**: In-memory maps for teams, sprints, retro items, and action items.
- **Domain**:
  - `Team` for groups of people.
  - `Sprint` for time-boxed iterations.
  - `RetroItem` for notes (Went Well, Did Not Go Well, Idea).
  - `ActionItem` for follow-through tasks linked to retro items.
- **Service**: `RetrospectiveService` manages all CRUD flows and limits.
- **Controllers**: `RetrospectiveController` exposes API endpoints; `WebConfig` provides CORS for the React app.

## Core Data Model
- **Team**: `id`, `name`, `createdAt`
- **Sprint**: `id`, `teamId`, `name`, `startDate`, `endDate`, `createdAt`
- **RetroItem**: `id`, `sprintId`, `type` (`WENT_WELL`, `DID_NOT_GO_WELL`, `IDEA`), `text`, `author`, `votes`, `actionItemId?`, `createdAt`
- **ActionItem**: `id`, `sprintId`, `text`, `owner`, `dueDate?`, `sourceItemId`, `status` (`OPEN`, `DONE`), `createdAt`

## File Structure
```
sprint-retrospective-poc/
├── README.md
├── TECHNICAL_README.md
├── backend/
│   ├── pom.xml
│   └── src/main/
│       ├── java/com/poc/retrospective/
│       │   ├── SprintRetrospectiveApplication.java
│       │   ├── api/
│       │   │   ├── RetrospectiveController.java
│       │   │   ├── WebConfig.java
│       │   │   ├── *Request/Response DTOs
│       │   ├── model/
│       │   │   ├── Team.java
│       │   │   ├── Sprint.java
│       │   │   ├── RetroItem.java
│       │   │   ├── ActionItem.java
│       │   │   ├── ItemType.java
│       │   │   └── ActionStatus.java
│       │   └── service/
│       │       └── RetrospectiveService.java
│       └── resources/
│           └── application.properties
└── frontend/
    ├── package.json
    ├── public/index.html
    └── src/
        ├── App.js
        ├── App.css
        └── index.js
```

## Flow
1. **Teams**: `GET /api/teams` lists teams; `POST /api/teams` creates one.
2. **Sprints**: `GET /api/teams/{teamId}/sprints` lists sprints; `POST /api/teams/{teamId}/sprints` creates one.
3. **Retro board**: `GET /api/sprints/{sprintId}/board` returns items grouped by type plus action items and summary metrics.
4. **Items**: `POST /api/sprints/{sprintId}/items` adds a note; `POST /api/items/{itemId}/vote` adjusts votes.
5. **Actions**: `POST /api/items/{itemId}/convert-action` converts a note to an action item; `POST /api/action-items/{actionId}/complete` toggles completion.

## API Details
- **Create team**: `POST /api/teams` `{ "name": "Atlas" }`
- **Create sprint**: `POST /api/teams/{teamId}/sprints` `{ "name": "Sprint 1", "startDate": "2026-01-01", "endDate": "2026-01-14" }`
- **Add retro item**: `POST /api/sprints/{sprintId}/items` `{ "type": "WENT_WELL", "text": "On-call noise dropped", "author": "Riya" }`
- **Vote**: `POST /api/items/{itemId}/vote` `{ "delta": 1 }` (range -3..3)
- **Convert to action**: `POST /api/items/{itemId}/convert-action` `{ "owner": "DevOps", "dueDate": "2026-01-20", "overrideText": "Reduce CI queue time" }`
- **Toggle action**: `POST /api/action-items/{actionId}/complete` `{ "done": true }`
- **Board response**: `GET /api/sprints/{sprintId}/board` returns `itemsByType`, `actionItems`, and `summary` (total items, total votes, completion rate, top 3 items).

## Notable Implementation Details
- **In-memory limits**: `app.max-items-per-sprint` and `app.max-action-items` prevent runaway growth.
- **Voting**: votes are aggregated on the item; the UI reloads the board after each change.
- **Summary**: top voted items and action completion rate are computed in the service.
- **Seed data**: the service seeds one team, sprint, and a few items for immediate exploration.
- **Sorting**: items are ordered by votes (desc), then most recent.
- **Validation**: request payloads are validated via Jakarta annotations.
- **Errors**: missing resources return `404`; limit violations return `400`.

## Frontend Notes
- React app fetches teams, sprints, and board state on selection.
- The board UI groups items by type and supports inline voting.
- Action items can be marked done and are reflected in the summary completion rate.

## Configuration
- `server.port=8096` — avoid collisions with other POCs.
- `springdoc.*` — Swagger/OpenAPI endpoints.
 - `app.max-items-per-sprint=200`
 - `app.max-action-items=80`

## Build/Run
- `mvn spring-boot:run`
- `npm install && npm start`
