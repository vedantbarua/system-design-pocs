# Technical README: Payment System POC

This document explains the architecture, flow, and file-by-file purpose of the payment-system proof-of-concept.

## Architecture Overview
- **Framework**: Spring Boot 3.2 (web + Thymeleaf).
- **Storage**: In-memory `ConcurrentHashMap<String, Payment>`; data resets on restart.
- **Domain**: `Payment` tracks amount, currency, status, and key timestamps.
- **Service**: `PaymentSystemService` validates inputs, enforces idempotency, and manages state transitions.
- **Controller**: `PaymentSystemController` exposes UI forms and JSON endpoints.
- **View**: `index.html` provides create/capture/refund flows and an event stream.

## File Structure
```
payment-system-poc/
- pom.xml                                      # Maven configuration (Spring Boot, Thymeleaf, validation)
- src/main/java/com/randomproject/paymentsystem/
  - PaymentSystemPocApplication.java           # Boots the Spring application
  - PaymentSystemController.java               # MVC + REST endpoints
  - PaymentSystemService.java                  # In-memory payments + idempotency + events
  - Payment.java                               # Payment domain model
  - PaymentStatus.java                         # Authorization/capture/refund states
  - PaymentRequest.java                        # JSON payload for creating payments
  - PaymentResponse.java                       # API response payload
  - PaymentEvent.java                          # Event stream entries
  - PaymentStats.java                          # Aggregated metrics for the UI
  - PaymentCreateResult.java                   # Service return wrapper for create
  - PaymentActionResult.java                   # Service return wrapper for capture/refund
- src/main/resources/
  - application.properties                     # Port + event retention config
  - templates/index.html                       # Thymeleaf UI
```

## Flow
1. **Create**: UI form or `/api/payments` sends `PaymentRequest` with amount, currency, merchant/customer IDs, and optional idempotency key.
2. **Authorize**: `PaymentSystemService` validates inputs, generates a payment ID, sets status to `AUTHORIZED`, and records an `AUTHORIZED` event. If `simulateFailure` is enabled it returns `FAILED` with a decline reason.
3. **Capture**: `/payments/capture` or `/api/payments/{id}/capture` moves an authorized payment to `CAPTURED`, adds a capture event, and returns the updated payment.
4. **Refund**: `/payments/refund` or `/api/payments/{id}/refund` moves a captured payment to `REFUNDED`, adds a refund event, and returns the updated payment.
5. **Read**: `/api/payments`, `/api/payments/{id}`, `/api/events`, and `/api/stats` expose current state for UI and JSON clients.

## Notable Implementation Details
- **Idempotency**: Re-using an idempotency key returns the original payment without creating a duplicate.
- **Currency validation**: Limited to USD/EUR/GBP/INR to keep the POC focused.
- **Event stream**: Stored in a bounded deque; newest events are shown first.
- **Status transitions**: Capture only from `AUTHORIZED`; refund only from `CAPTURED`.

## Configuration
- `server.port=8088` - avoid clashing with other POCs.
- `payment.max-events=120` - cap the event stream size.

## Build/Run
- `mvn org.springframework.boot:spring-boot-maven-plugin:run` - starts the app with dev-friendly defaults (Thymeleaf caching disabled).
