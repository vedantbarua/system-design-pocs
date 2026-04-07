# Confluence POC

Confluence-style knowledge hub with an in-memory Spring Boot backend for spaces, pages, comments, search, and recent activity, plus a React UI for browsing and editing team knowledge.

## Goal

Demonstrate the core data and workflow model of an internal knowledge system: spaces that group pages, versioned page editing, comments for collaboration, search across content and labels, and recent activity for discovery.

## What It Covers

- Space creation and listing
- Page creation, editing, labels, and status changes
- Incrementing page versions on save
- Comment threads per page
- Search across title, body, and labels
- Recent-page feed and seeded starter content

## Quick Start

1. Start the backend:
   ```bash
   cd confluence-poc/backend
   mvn spring-boot:run
   ```
2. Start the frontend:
   ```bash
   cd confluence-poc/frontend
   npm install
   npm run dev
   ```
3. Open the frontend at the Vite dev-server URL.

## UI Flows

- Browse seeded spaces and pages on first load
- Create a new space and add pages to it
- Edit a page body, labels, and status, then save a new version
- Add comments to an existing page
- Search for pages by keyword or label and inspect recent activity

## JSON Endpoints

- `GET /api/spaces`
- `POST /api/spaces`
- `GET /api/spaces/{spaceId}/pages`
- `POST /api/spaces/{spaceId}/pages`
- `GET /api/pages/{pageId}`
- `PUT /api/pages/{pageId}`
- `GET /api/pages/{pageId}/comments`
- `POST /api/pages/{pageId}/comments`
- `GET /api/pages/search?q=...`
- `GET /api/pages/recent?limit=8`
- `GET /api/users`

## Configuration

- backend settings live in `backend/src/main/resources/application.yml`
- frontend development settings live in `frontend/vite.config.js`
- all application data is seeded in memory when the backend starts

## Notes and Limitations

- All spaces, pages, comments, and users are in memory and reset on restart.
- Search is simple substring matching and does not include ranking, stemming, or permissions.
- The POC models content editing, not collaborative real-time editing or access control.

## Technologies Used

- Spring Boot
- Java
- React
- Vite

## Swagger / OpenAPI

- Swagger UI: `/swagger-ui`
- OpenAPI JSON: `/api-docs`
