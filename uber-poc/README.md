# Uber POC

A ride-hailing proof of concept built with Spring Boot, in-memory data, and Thymeleaf.

## Features

- Create riders and drivers with ratings and zones
- Request trips with pickup/dropoff, product selection, and distance
- Match drivers to trips and update trip status
- Simple surge multiplier and fare estimates
- JSON API for riders, drivers, trips, assignments, and metrics

## Quick Start

1. Ensure you have Java 17+ and Maven installed.
2. Navigate to the project directory: `cd uber-poc`
3. Run: `mvn org.springframework.boot:spring-boot-maven-plugin:run`
4. Open `http://localhost:8103` in your browser

## Endpoints

- `/` - Dispatch console UI
- `/api/metrics` - Metrics summary (JSON)
- `/api/riders` - Riders (JSON)
- `/api/drivers` - Drivers + status updates (JSON)
- `/api/trips` - Trip requests + status updates (JSON)
- `/api/assignments` - Match drivers to trips (JSON)

## Technologies

- Spring Boot 3.2.0
- Java 17
- Thymeleaf
- Bootstrap-free UI (custom CSS)

## Hosting

Local: Run as above. For cloud: Build JAR with `mvn clean package`, deploy to Railway/Render/Fly.io.

See TECHNICAL_README.md for detailed explanations.
