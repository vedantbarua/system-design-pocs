# Technical README: URL Shortener POC

This document explains the architecture, flow, and file-by-file purpose of the URL shortener proof-of-concept.

## Architecture Overview
- **Framework**: Spring Boot 3.2 (web + Thymeleaf).
- **Storage**: In-memory `ConcurrentHashMap<String, ShortLink>`; data resets on restart.
- **Domain**: `ShortLink` holds code, target URL, hit counter, and creation timestamp.
- **Service**: `UrlShorteningService` normalizes URLs, enforces unique codes, and generates base-36 IDs.
- **Controller**: `UrlShorteningController` drives the UI, redirect handler, and JSON endpoints.
- **View**: `index.html` presents a form and table of links.

## File Structure
```
url-shortner-poc/
├── pom.xml                                  # Maven configuration (Spring Boot, Thymeleaf, validation)
├── src/main/java/com/randomproject/urlshortner/
│   ├── UrlShortnerPocApplication.java       # Boots the Spring application
│   ├── ShortLink.java                       # Domain object with hit counter
│   ├── UrlShorteningService.java            # In-memory store + code generation + normalization
│   ├── UrlShorteningController.java         # MVC + REST endpoints + redirect handler
│   ├── ShortenRequest.java                  # JSON payload for /api/shorten
│   └── ShortLinkResponse.java               # API response shape for link data
└── src/main/resources/
    ├── application.properties               # Port + base URL config
    └── templates/index.html                 # Thymeleaf UI
```

## Flow
1. **Create**: Form POST `/shorten` or JSON POST `/api/shorten` calls `UrlShorteningService.create(...)`.
2. **Store**: Service normalizes URL (prepends `https://` if missing, validates host), picks provided alias or generates base-36 code, ensures uniqueness, saves `ShortLink`.
3. **Redirect**: GET `/s/{code}` looks up the link, increments hit counter, and issues an HTTP redirect to `targetUrl`. Unknown codes bounce back to `/` with a message.
4. **Read**: GET `/` renders existing links (newest first). `/api/links` and `/api/links/{code}` expose the same data as JSON.

## Notable Implementation Details
- **Base-36 generator**: `UrlShorteningService` uses an `AtomicLong` counter, converted with `Long.toString(value, 36)` for compact IDs.
- **URL normalization**: If no scheme is present, `https://` is prefixed; `URI.create(...)` validates the host.
- **Thread safety**: Map is concurrent; mutations are synchronized to keep code generation and uniqueness checks consistent.
- **View data**: Controller sorts links by `createdAt` descending before rendering or returning JSON.

## Configuration
- `server.port=8082` — avoid clashing with other POCs.
- `app.base-url=http://localhost:8082` — used to compose full short URLs in UI/API responses.

## Build/Run
- `mvn org.springframework.boot:spring-boot-maven-plugin:run` — starts the app with dev-friendly defaults (Thymeleaf caching disabled).
