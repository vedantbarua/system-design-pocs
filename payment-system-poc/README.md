# Payment System POC

Spring Boot proof-of-concept for a payment gateway flow with authorization, capture, refunds, idempotency, and event tracking.

## Features
- Create payments via UI or JSON API.
- Simulated authorization and optional immediate capture.
- Capture and refund endpoints with state validation.
- Idempotency keys for safe retries.
- In-memory ledger + event stream (resets on restart).

## Quick Start
1. Ensure Java 17+ and Maven are installed.
2. Run the app:
   ```bash
   cd payment-system-poc
   mvn org.springframework.boot:spring-boot-maven-plugin:run
   ```
3. Open `http://localhost:8088` to create and manage payments.

## Endpoints
- `/` (GET): UI to create payments, view status, and actions.
- `/payments` (POST form): Create a payment.
- `/payments/capture` (POST form): Capture a payment by ID.
- `/payments/refund` (POST form): Refund a payment by ID.
- `/api/payments` (POST JSON): Create payment.
- `/api/payments` (GET): List payments.
- `/api/payments/{id}` (GET): Fetch a payment.
- `/api/payments/{id}/capture` (POST): Capture an authorized payment.
- `/api/payments/{id}/refund` (POST): Refund a captured payment.
- `/api/events` (GET): Recent payment events.
- `/api/stats` (GET): Aggregated stats.

## Config
- `server.port` (default `8088`)
- `payment.max-events` (default `120`)

See `TECHNICAL_README.md` for deeper details and `IMPROVEMENTS.md` for future ideas.
