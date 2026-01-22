# Technical README: Google Docs POC

This document explains the architecture, flow, and file-by-file purpose of the Google Docs-style proof-of-concept.

## Architecture Overview
- Framework: Spring Boot 3.2 with MVC and Thymeleaf for the UI.
- Storage: In-memory maps for documents, versions, comments, and collaborators.
- Service: `GoogleDocsService` validates inputs, tracks versions, and enforces roles.
- Controller: `GoogleDocsController` renders the UI and exposes JSON endpoints.
- Views: `index.html` and `document.html` provide the workspace UI.

## File Structure
```
google-docs-poc/
|-- pom.xml                                      # Maven configuration (Spring Boot, Thymeleaf, validation)
|-- src/main/java/com/randomproject/googledocs/
|   |-- GoogleDocsPocApplication.java            # Boots the Spring application
|   |-- GoogleDocsController.java                # MVC + REST endpoints
|   |-- GoogleDocsService.java                   # In-memory storage, validation, versions
|   |-- DocsDefaults.java                        # UI defaults configuration
|   |-- DocumentEntry.java                       # Document model
|   |-- DocumentVersion.java                     # Version model
|   |-- CommentEntry.java                        # Comment model
|   |-- CollaboratorEntry.java                   # Collaborator model
|   |-- CreateDocumentRequest.java               # Validation-backed request payload
|   |-- UpdateDocumentRequest.java               # Validation-backed request payload
|   |-- AddCommentRequest.java                   # Validation-backed request payload
|   `-- AddCollaboratorRequest.java              # Validation-backed request payload
`-- src/main/resources/
    |-- application.properties                   # Port + Docs defaults
    `-- templates/
        |-- index.html                            # Document list + create form
        `-- document.html                         # Editing workspace, comments, versions
```

## Flow
1. Home: GET `/` renders document list and create form.
2. Create doc: POST `/docs` validates input and seeds version 1.
3. Edit: POST `/docs/{id}/edit` creates a new version and updates metadata.
4. Collaborators: POST `/docs/{id}/collaborators` stores roles used by edit checks.
5. Comments: POST `/docs/{id}/comments` creates a new thread entry.
6. Resolve: POST `/docs/{id}/comments/{commentId}/resolve` toggles comment status.
7. API: `/api/docs/**` mirrors the UI behavior for automation.

## Notable Implementation Details
- Versioning: Each edit produces a new `DocumentVersion` entry.
- Roles: VIEWER collaborators cannot edit; OWNER and EDITOR can.
- Limits: Max content length and document count are enforced in service.
- Defaults: `DocsDefaults` exposes values for the UI header.

## Configuration
- `server.port=8096` - avoid clashing with other POCs.
- `google.docs.max-content-length=120000` - max characters per doc.
- `google.docs.default-owner=alex@docs.local` - UI fallback owner.
- `google.docs.max-docs=200` - total docs allowed.
- `spring.thymeleaf.cache=false` - hot reload templates during development.

## Build/Run
- `mvn org.springframework.boot:spring-boot-maven-plugin:run`
