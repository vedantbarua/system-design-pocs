# Unique ID Generator in Distributed Systems POC

Spring Boot proof-of-concept for a Snowflake-style unique ID generator with a small UI and JSON endpoints.

## Features
- Generate sortable 64-bit IDs with timestamp, node id, and sequence bits
- Decode an ID into its component fields
- Track active nodes and last sequence values
- JSON API for automation

## Quick Start
1. Ensure Java 17+ and Maven are installed.
2. Run the app:
   ```bash
   cd unique-id-generator-in-distributed-systems-poc
   mvn org.springframework.boot:spring-boot-maven-plugin:run
   ```
3. Open `http://localhost:8087` for the UI.

## Endpoints
- `/` — UI to generate and decode IDs
- `/generate` `POST` — Generate a batch (`nodeId`, `count`)
- `/decode` `POST` — Decode an ID (`id`)
- `/api/ids` `POST` — Generate IDs (`nodeId`, `count`)
- `/api/ids/{id}` `GET` — Decode an ID
- `/api/nodes` `GET` — List active nodes
- `/api/config` `GET` — Show generator configuration

## Notes
- Node id range is controlled by `id.node-bits` (default 0-1023).
- Sequence wraps after `id.sequence-bits` (default 0-4095) within the same millisecond.
- If the system clock moves backward, ID generation fails with a validation error.

## Technologies
- Spring Boot 3.2 (web + Thymeleaf + validation)
- Java 17
- In-memory node state map
