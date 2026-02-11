# Confluence POC

A Confluence-style knowledge hub with:
- In-memory Spring Boot API for spaces, pages, comments, search, and recent activity
- React UI for browsing spaces, editing pages, and adding comments
- Seed data for quick exploration on first run

## Structure
- `backend`: Spring Boot REST API
- `frontend`: React (Vite)

## Prerequisites
- Java 17+
- Maven
- Node 18+

## Run backend
```bash
cd /Users/vedantbarua/Desktop/Projects/system-design-pocs/confluence-poc/backend
mvn spring-boot:run
```

## Run frontend
```bash
cd /Users/vedantbarua/Desktop/Projects/system-design-pocs/confluence-poc/frontend
npm install
npm run dev
```

## API (core)
- `GET /api/spaces`
- `POST /api/spaces` `{ key, name, owner }`
- `GET /api/spaces/{spaceId}/pages`
- `POST /api/spaces/{spaceId}/pages` `{ title, body, labels, author }`
- `GET /api/pages/{pageId}`
- `PUT /api/pages/{pageId}` `{ title, body, labels, status, editor }`
- `GET /api/pages/{pageId}/comments`
- `POST /api/pages/{pageId}/comments` `{ author, text }`
- `GET /api/pages/search?q=...`
- `GET /api/pages/recent?limit=8`
- `GET /api/users`

## Swagger / OpenAPI
- Swagger UI: `/swagger-ui`
- OpenAPI JSON: `/api-docs`
