# YouTube Top-K POC

Spring Boot proof-of-concept for ranking videos by engagement score and returning top-K results with a lightweight UI and JSON endpoints.

## Features
- Track videos with views, likes, channels, and tags
- Compute top-K rankings by a simple weighted score
- Filter leaderboard by tag
- Record engagement deltas to simulate traffic
- In-memory store resets on restart

## Quick Start
1. Ensure Java 17+ and Maven are installed.
2. Run the app:
   ```bash
   cd youTube-top-K-poc
   mvn org.springframework.boot:spring-boot-maven-plugin:run
   ```
3. Open `http://localhost:8099` for the UI.

## Endpoints
- `/` — UI for leaderboard, video management, and engagement events
- `/top` `POST` — Fetch top-K (`tag`, optional `limit`)
- `/videos` `POST` — Add/update video (`id`, `title`, `channel`, optional `tags`, optional `views`, optional `likes`)
- `/events` `POST` — Record engagement (`id`, optional `viewDelta`, optional `likeDelta`)
- `/api/top` `GET` — JSON top-K (`tag`, optional `limit`)
- `/api/videos` `GET` — JSON list of videos
- `/api/videos` `POST` — JSON add/update
- `/api/events` `POST` — JSON engagement event

## Notes
- Score = views × viewWeight + likes × likeWeight (configurable via `application.properties`).
- Tags are comma-separated in the UI and are case-insensitive for filtering.
- Video ids must use letters, numbers, `.`, `_`, `-`, or `:`.

## Technologies
- Spring Boot 3.2 (web + Thymeleaf + validation)
- Java 17
- In-memory map for storage
