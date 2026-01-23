# Tinder POC

A swipe-style matchmaking proof of concept built with Spring Boot, in-memory data, and Thymeleaf.

## Features

- Profile deck with like, nope, and super like actions
- Match list with recent activity
- Profile detail views and queue preview
- Create new profiles with validation
- JSON API for profiles, swipes, and matches

## Quick Start

1. Ensure you have Java 17+ and Maven installed.
2. Navigate to the project directory: `cd tinder-poc`
3. Run: `mvn org.springframework.boot:spring-boot-maven-plugin:run`
4. Open `http://localhost:8097` in your browser

## Endpoints

- `/` - Swipe deck
- `/profile/{id}` - Profile detail
- `/matches` - Match list
- `/new` - Create a new profile
- `/api/summary` - Summary stats (JSON)
- `/api/profiles` - All profiles (JSON)
- `/api/profiles/queue` - Remaining queue (JSON)
- `/api/matches` - Matches (JSON)
- `/api/swipes` - Record swipe (JSON)

## Technologies

- Spring Boot 3.2.0
- Java 17
- Thymeleaf
- Bootstrap

## Hosting

Local: Run as above. For cloud: Build JAR with `mvn clean package`, deploy to Railway/Render/Fly.io.

See TECHNICAL_README.md for detailed explanations.
