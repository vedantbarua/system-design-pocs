# News Feed System POC

Spring Boot proof-of-concept for a simple news feed with users, follow graph, and time-ordered posts. Includes a UI and JSON endpoints.

## Features
- Create users and follow relationships
- Publish short posts (280 chars)
- Per-user feed aggregated from followees + self
- In-memory store resets on restart

## Quick Start
1. Ensure Java 17+ and Maven are installed.
2. Run the app:
   ```bash
   cd news-feed-system-poc
   mvn org.springframework.boot:spring-boot-maven-plugin:run
   ```
3. Open `http://localhost:8091` for the UI.

## Endpoints
- `/` — UI for users, follows, posts, and feed
- `/users` `POST` — Create user (form)
- `/follow` `POST` — Create follow (form)
- `/posts` `POST` — Create post (form)
- `/api/users` `GET` — List users
- `/api/users` `POST` — Create user (`name`)
- `/api/follows` `POST` — Create follow (`followerId`, `followeeId`)
- `/api/posts` `POST` — Create post (`authorId`, `content`)
- `/api/feed/{userId}` `GET` — Fetch feed for user (optional `limit`)

## Notes
- Feed includes the selected user's own posts.
- Post history per user is capped by `app.max-posts-per-user`.
- Default feed size is set by `app.feed-size`.

## Technologies
- Spring Boot 3.2 (web + Thymeleaf + validation)
- Java 17
- In-memory store with concurrent collections
