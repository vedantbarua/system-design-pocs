# URL Shortener POC

Spring Boot proof-of-concept for shortening URLs with an in-memory store, simple UI, and redirect endpoint.

## Features
- Create short links via UI or JSON API.
- Custom aliases or auto-generated base-36 codes.
- Redirect handler at `/s/{code}` with hit counting.
- In-memory map (resets on restart) with quick-start defaults.

## Quick Start
1. Ensure Java 17+ and Maven are installed.
2. Run the app:
   ```bash
   cd url-shortner-poc
   mvn org.springframework.boot:spring-boot-maven-plugin:run
   ```
3. Open `http://localhost:8082` to create links. Redirects live at `http://localhost:8082/s/{code}`.

## Endpoints
- `/` (GET): UI to create links and list existing ones.
- `/shorten` (POST form): Create link with `url` and optional `alias`.
- `/s/{code}` (GET): Redirect to the target URL and increment hit count.
- `/api/shorten` (POST JSON): `{ "url": "...", "alias": "optional" }` → 201 with short link payload.
- `/api/links` (GET): List all links.
- `/api/links/{code}` (GET): Details for a single link.

## Config
- `server.port` (default `8082`)
- `app.base-url` (default `http://localhost:8082`)

See `TECHNICAL_README.md` for deeper details and `IMPROVEMENTS.md` for future ideas.
