# Local Delivery Service POC

Spring Boot proof-of-concept for dispatching local deliveries with orders, drivers, status updates, a UI dashboard, and JSON endpoints.

## Features
- Create delivery orders with size, priority, and zone
- Add drivers and assign them to orders with ETA
- Update order and driver status
- Live metrics for active and unassigned deliveries
- In-memory storage resets on restart

## Quick Start
1. Ensure Java 17+ and Maven are installed.
2. Run the app:
   ```bash
   cd local-delivery-service-poc
   mvn org.springframework.boot:spring-boot-maven-plugin:run
   ```
3. Open `http://localhost:8093` for the UI.

## Endpoints
- `/` — UI dashboard
- `/orders` `POST` — Create/update an order
- `/drivers` `POST` — Add/update a driver
- `/assignments` `POST` — Assign a driver to an order
- `/orders/{id}/status` `POST` — Update order status
- `/drivers/{id}/status` `POST` — Update driver status
- `/api/orders` `POST` — Create/update order (JSON)
- `/api/orders` `GET` — List orders
- `/api/orders/{id}` `GET` — Fetch one order
- `/api/orders/{id}` `DELETE` — Cancel an order
- `/api/orders/{id}/status` `POST` — Update order status (JSON)
- `/api/assignments` `POST` — Assign a driver (JSON)
- `/api/drivers` `POST` — Add/update driver (JSON)
- `/api/drivers` `GET` — List drivers
- `/api/drivers/{id}` `GET` — Fetch one driver
- `/api/drivers/{id}/status` `POST` — Update driver status (JSON)
- `/api/metrics` `GET` — Order/driver metrics

## Notes
- Ids must use letters, numbers, `.`, `_`, `-`, or `:`.
- ETA minutes must be at least 5.
- Drivers with active orders stay in `ON_DELIVERY`.

## Technologies
- Spring Boot 3.2 (web + Thymeleaf + validation)
- Java 17
- In-memory maps (ConcurrentHashMap)
