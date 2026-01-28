# Ticketmaster POC

Spring Boot proof-of-concept for a Ticketmaster-style ticketing platform with events, venues, tiers, holds, and checkout.

## Features
- Event listings with venue metadata and status (on sale, sold out, past)
- Ticket tiers with pricing, capacity, held, and sold counts
- Hold workflow with expiration window
- Order checkout with fees and totals
- UI + JSON API for events, tiers, holds, and orders
- In-memory storage with seed data

## Quick Start
1. Ensure Java 17+ and Maven are installed.
2. Run the app:
   ```bash
   cd ticketmaster-poc
   mvn org.springframework.boot:spring-boot-maven-plugin:run
   ```
3. Open `http://localhost:8102` for the UI.

## Endpoints
- `/` — Event list + forms for venues and events
- `/events/{id}` — Event detail + tiers, holds, and orders
- `/venues` `POST` — Create venue (form)
- `/events` `POST` — Create event (form)
- `/events/{id}/tiers` `POST` — Create tier (form)
- `/holds` `POST` — Create hold (form)
- `/holds/{id}/release` `POST` — Release hold
- `/orders` `POST` — Place order (form)

### JSON API
- `/api/summary` `GET` — Summary metrics
- `/api/venues` `GET|POST` — List/create venues
- `/api/events` `GET|POST` — List/create events
- `/api/events/{id}` `GET` — Event details
- `/api/events/{id}/tiers` `GET|POST` — List/create tiers
- `/api/holds` `GET|POST` — List/create holds (`eventId` optional)
- `/api/holds/{id}/release` `POST` — Release hold
- `/api/orders` `GET|POST` — List/create orders (`eventId` optional)

## Notes
- Holds expire after a configurable number of minutes.
- Order total = price × quantity + (percentage fee + flat fee).
- Status is derived from event time and availability.

## Technologies
- Spring Boot 3.2
- Java 17
- Thymeleaf
- In-memory storage

See `TECHNICAL_README.md` for architecture details and `IMPROVEMENTS.md` for next steps.
