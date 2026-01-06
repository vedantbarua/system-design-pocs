# Key-Value Store POC

Spring Boot proof-of-concept for an in-memory key-value store with optional TTLs, a simple UI, and JSON endpoints.

## Features
- Store/update key-value pairs with optional expiration (TTL)
- List entries and delete keys from the UI
- JSON API for automation and scripts
- In-memory map resets on restart

## Quick Start
1. Ensure Java 17+ and Maven are installed.
2. Run the app:
   ```bash
   cd key-value-store-poc
   mvn org.springframework.boot:spring-boot-maven-plugin:run
   ```
3. Open `http://localhost:8084` for the UI.

## Endpoints
- `/` — UI to set values and list entries
- `/kv` `POST` — Store a key (`key`, `value`, optional `ttlSeconds`)
- `/kv/{key}/delete` `POST` — Delete a key
- `/api/entries` `GET` — List all entries
- `/api/entries/{key}` `GET` — Fetch one entry
- `/api/entries` `POST` — Store entry (`key`, `value`, optional `ttlSeconds`)
- `/api/entries/{key}` `DELETE` — Delete a key

## Notes
- Keys must use letters, numbers, `.`, `_`, `-`, or `:`.
- TTL is in seconds; if omitted, the entry does not expire.

## Technologies
- Spring Boot 3.2 (web + Thymeleaf + validation)
- Java 17
- In-memory store (ConcurrentHashMap)
