# Price Tracker POC

Spring Boot proof-of-concept for tracking target prices, logging updates, and flagging deals with a simple UI and JSON endpoints.

## Features
- Track items with target and current price
- Update prices manually to simulate checks
- Deal list for items below target
- In-memory store resets on restart

## Quick Start
1. Ensure Java 17+ and Maven are installed.
2. Run the app:
   ```bash
   cd price-tracker-poc
   mvn org.springframework.boot:spring-boot-maven-plugin:run
   ```
3. Open `http://localhost:8090` for the UI.

## Endpoints
- `/` — UI to track items and update prices
- `/items` `POST` — Track/update an item (`id`, `name`, optional `url`, `targetPrice`, `currentPrice`)
- `/items/{id}/price` `POST` — Update current price
- `/items/{id}/delete` `POST` — Delete an item
- `/api/items` `POST` — Track/update item (JSON)
- `/api/items` `GET` — List tracked items
- `/api/items/{id}` `GET` — Fetch one item
- `/api/items/{id}/price` `POST` — Update current price (JSON)
- `/api/items/{id}` `DELETE` — Delete an item
- `/api/alerts` `GET` — List items below target price

## Notes
- Item ids must use letters, numbers, `.`, `_`, `-`, or `:`.
- Prices must be greater than zero.
- URLs must start with `http://` or `https://` when provided.

## Technologies
- Spring Boot 3.2 (web + Thymeleaf + validation)
- Java 17
- In-memory map (ConcurrentHashMap)
