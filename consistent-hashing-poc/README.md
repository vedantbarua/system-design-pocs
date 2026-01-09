# Consistent Hashing POC

Spring Boot proof-of-concept for a consistent hashing ring with virtual nodes, a small UI, and JSON endpoints for automation.

## Features
- Add/remove nodes and rebuild a hash ring with virtual nodes
- Assign keys to nodes with minimal remapping
- Inspect ring entries and node counts in the UI
- JSON API for scripting and integration

## Quick Start
1. Ensure Java 17+ and Maven are installed.
2. Run the app:
   ```bash
   cd consistent-hashing-poc
   mvn org.springframework.boot:spring-boot-maven-plugin:run
   ```
3. Open `http://localhost:8086` for the UI.

## Endpoints
- `/` — UI to manage nodes, assign keys, and view the ring
- `/nodes` `POST` — Add a node (`nodeId`)
- `/nodes/{nodeId}/remove` `POST` — Remove a node
- `/assign` `POST` — Assign a key (`key`)
- `/api/nodes` `GET` — List nodes
- `/api/nodes` `POST` — Add a node (`nodeId`)
- `/api/nodes/{nodeId}` `DELETE` — Remove a node
- `/api/assign` `POST` — Assign a key (`key`)
- `/api/ring` `GET` — List ring entries

## Notes
- Node ids and keys must use letters, numbers, `.`, `_`, `-`, or `:`.
- Hashing uses MD5 and the first 64 bits of the digest for ring positions.
- Virtual node count is configurable in `application.properties`.

## Technologies
- Spring Boot 3.2 (web + Thymeleaf + validation)
- Java 17
- In-memory hash ring (TreeMap)
