# Strava POC

A simple proof of concept for a Strava-like activity feed built with Spring Boot and Thymeleaf.

## Features

- View recent activities with distance, duration, and pace
- Activity detail page
- Log new activities with validation
- In-memory storage with seed activities

## Quick Start

1. Ensure you have Java 17+ and Maven installed.
2. Navigate to the project directory: `cd strava-poc`
3. Run: `mvn org.springframework.boot:spring-boot-maven-plugin:run`
4. Open `http://localhost:8092` in your browser

## Endpoints

- `/` - Activity feed
- `/activity/{id}` - Activity details
- `/new` - New activity form

## Technologies

- Spring Boot 3.2.0
- Java 17
- Thymeleaf
- Bootstrap

## Hosting

Local: Run as above. For cloud: Build JAR with `mvn clean package`, deploy to Railway/Render/Fly.io.

See TECHNICAL_README.md for detailed explanations.
