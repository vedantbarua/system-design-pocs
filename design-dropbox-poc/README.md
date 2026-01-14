# Design Dropbox POC

Spring Boot proof-of-concept for a Dropbox-style workspace with folders, file uploads, and share links.

## Features
- Create folders and upload text-based files
- In-memory storage with size limits
- Share links with TTL-based expiry
- JSON API for automation

## Quick Start
1. Ensure Java 17+ and Maven are installed.
2. Run the app:
   ```bash
   cd design-dropbox-poc
   mvn org.springframework.boot:spring-boot-maven-plugin:run
   ```
3. Open `http://localhost:8089` for the UI.

## Endpoints
- `/` — UI for folders, uploads, and share links
- `/folders` `POST` — Create folder (`name`, `parentId`)
- `/files` `POST` — Upload file (`name`, `content`, `parentId`)
- `/shares` `POST` — Create share link (`fileId`, `ttlMinutes`)
- `/shares/{token}` `GET` — Download a file via share token
- `/api/folders` `POST` — Create folder as JSON
- `/api/files` `POST` — Upload file as JSON
- `/api/shares` `POST` — Create share link as JSON
- `/api/folders` `GET` — List folders
- `/api/files` `GET` — List files
- `/api/shares` `GET` — List share links
- `/api/shares/{token}` `GET` — Download file via JSON

## Notes
- File content is stored in memory and cleared on restart.
- File size limit is controlled by `dropbox.max-file-size`.
- Share links expire after `dropbox.default-ttl-minutes` unless overridden.

## Technologies
- Spring Boot 3.2 (web + Thymeleaf + validation)
- Java 17
- In-memory maps
