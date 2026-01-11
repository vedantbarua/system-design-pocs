# Web Crawler POC

Spring Boot proof-of-concept for a small web crawler with a UI and JSON endpoint.

## Features
- Breadth-first crawl with max depth and max page limits
- Same-host toggle to keep the crawl scoped
- Extracts titles and link counts for HTML pages
- JSON API for automation

## Quick Start
1. Ensure Java 17+ and Maven are installed.
2. Run the app:
   ```bash
   cd web-crawler-poc
   mvn org.springframework.boot:spring-boot-maven-plugin:run
   ```
3. Open `http://localhost:8088` for the UI.

## Endpoints
- `/` — UI to configure and run a crawl
- `/crawl` `POST` — Run a crawl (`startUrl`, `maxDepth`, `maxPages`, `delayMillis`, `sameHostOnly`)
- `/api/crawl` `POST` — Run a crawl as JSON

## Notes
- Only `http` and `https` URLs are accepted.
- Only HTML pages are parsed for links.
- The crawler is single-threaded and in-memory; results reset on restart.
- Configure defaults in `application.properties`.

## Technologies
- Spring Boot 3.2 (web + Thymeleaf + validation)
- Java 17
- Java HttpClient
