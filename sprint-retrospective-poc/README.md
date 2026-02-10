# Sprint Retrospective POC

A sprint retrospective proof-of-concept with:
- In-memory Spring Boot API for teams, sprints, retro items, votes, and action items
- React board UI for capturing signals and tracking follow-through
 - Seed data for quick exploration on first run

## Structure
- `backend`: Spring Boot REST API
- `frontend`: React (CRA) board

## Prerequisites
- Java 17+
- Maven
- Node 18+

## Run backend
```bash
cd /Users/vedantbarua/Desktop/Projects/system-design-pocs/sprint-retrospective-poc/backend
mvn spring-boot:run
```

## Run frontend
```bash
cd /Users/vedantbarua/Desktop/Projects/system-design-pocs/sprint-retrospective-poc/frontend
npm install
npm start
```

## API (core)
- `GET /api/teams`
- `POST /api/teams` `{ name }`
- `GET /api/teams/{teamId}/sprints`
- `POST /api/teams/{teamId}/sprints` `{ name, startDate, endDate }`
- `GET /api/sprints/{sprintId}/board`
- `POST /api/sprints/{sprintId}/items` `{ type, text, author }`
- `POST /api/items/{itemId}/vote` `{ delta }`
- `POST /api/items/{itemId}/convert-action` `{ owner, dueDate?, overrideText? }`
- `POST /api/action-items/{actionId}/complete` `{ done }`

## Quick Demo
```bash
curl -X POST http://localhost:8096/api/teams \\
  -H 'Content-Type: application/json' \\
  -d '{\"name\":\"Atlas\"}'
```

```bash
curl -X POST http://localhost:8096/api/teams/101/sprints \\
  -H 'Content-Type: application/json' \\
  -d '{\"name\":\"Sprint 1\",\"startDate\":\"2026-01-01\",\"endDate\":\"2026-01-14\"}'
```

```bash
curl -X POST http://localhost:8096/api/sprints/201/items \\
  -H 'Content-Type: application/json' \\
  -d '{\"type\":\"WENT_WELL\",\"text\":\"On-call noise dropped\",\"author\":\"Riya\"}'
```

## Swagger / OpenAPI
- Swagger UI: `/swagger-ui`
- OpenAPI JSON: `/api-docs`

## Technical Doc
- See `TECHNICAL_README.md`
