# Google Docs POC

Spring Boot proof-of-concept for a Google Docs-style collaborative editor with version history, comments, and roles.

## Features
- Create documents with an owner and initial content
- Save new versions with editor tracking
- Assign collaborators (OWNER / EDITOR / VIEWER)
- Comment threads with resolve flow
- JSON API for automation

## Quick Start
1. Ensure Java 17+ and Maven are installed.
2. Run the app:
   ```bash
   cd google-docs-poc
   mvn org.springframework.boot:spring-boot-maven-plugin:run
   ```
3. Open `http://localhost:8096` for the UI.

## Endpoints
- `/` - UI for creating and listing docs
- `/docs/{id}` - Document workspace
- `/docs` `POST` - Create document (form)
- `/docs/{id}/edit` `POST` - Save new version (form)
- `/docs/{id}/collaborators` `POST` - Add collaborator (form)
- `/docs/{id}/comments` `POST` - Add comment (form)
- `/docs/{id}/comments/{commentId}/resolve` `POST` - Resolve comment (form)
- `/api/docs` `GET` - List documents
- `/api/docs` `POST` - Create document as JSON
- `/api/docs/{id}` `GET` - Fetch document
- `/api/docs/{id}` `PUT` - Save new version
- `/api/docs/{id}/versions` `GET` - List versions
- `/api/docs/{id}/comments` `GET` - List comments
- `/api/docs/{id}/comments` `POST` - Add comment
- `/api/docs/{id}/comments/{commentId}/resolve` `POST` - Resolve comment
- `/api/docs/{id}/collaborators` `GET` - List collaborators
- `/api/docs/{id}/collaborators` `POST` - Add collaborator

## Notes
- All data is stored in memory and resets on restart.
- Content size is capped by `google.docs.max-content-length`.
- Document count is capped by `google.docs.max-docs`.
- Viewer collaborators cannot edit documents.

## Technologies
- Spring Boot 3.2 (web + Thymeleaf + validation)
- Java 17
- In-memory maps
