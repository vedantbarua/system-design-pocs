# Transactional Outbox POC

A Spring Boot proof-of-concept for writing domain state and integration events atomically, then delivering those events through a relay to an idempotent consumer.

## Goal

Show the core reliability pattern behind many order, payment, and workflow systems: commit the business record and the event record in the same database transaction, then publish asynchronously without losing events or applying duplicate side effects.

## What It Covers

- Transactional order write plus outbox event insert
- Outbox relay with retryable publish failures
- Broker table that stands in for Kafka, RabbitMQ, or SQS
- Idempotent consumer with an inbox table
- Duplicate delivery detection
- Poison-message retry and DLQ behavior
- Operational UI with orders, outbox rows, broker messages, inbox rows, and audit events

## Quick Start

```bash
cd transactional-outbox-poc
mvn spring-boot:run
```

Open:

```text
http://localhost:8096
```

The app uses an in-memory H2 database and resets on restart.

## Demo Flow

1. Create a normal order.
2. Watch an outbox row appear as `PENDING`.
3. The relay publishes it to the broker table and marks the outbox row `PUBLISHED`.
4. The consumer processes the broker message, inserts an inbox row, and marks the order `EMAIL_SENT`.
5. Publish a duplicate from the outbox row and verify the consumer marks it `DUPLICATE`.
6. Arm a relay failure, create another order, and watch the outbox row stay `PENDING` until the next relay pass.
7. Create a poison event and watch it retry until it moves to `DLQ`.

## JSON Endpoints

Create an order:

```http
POST /api/orders
Content-Type: application/json

{
  "customerId": "customer-42",
  "sku": "sku-keyboard",
  "quantity": 1,
  "poisonEvent": false
}
```

Get the full system state:

```http
GET /api/snapshot
```

Run one relay and consumer pass:

```http
POST /api/controls/drain
```

## Configuration

| Setting | Default | Purpose |
| --- | --- | --- |
| `server.port` | `8096` | Local HTTP port |
| `spring.datasource.url` | `jdbc:h2:mem:transactional-outbox` | In-memory demo database |
| `spring.h2.console.enabled` | `true` | Enables local H2 console |

## Notes And Limitations

- The broker is modeled as a database table to keep the POC local and inspectable.
- Scheduling is single-process; a production relay would need leasing or partition ownership.
- Payloads are simple JSON strings rather than schema-managed event contracts.
- The consumer side effect is represented by changing order status to `EMAIL_SENT`.

## Technologies Used

- Java 17
- Spring Boot 3.2
- Spring MVC
- Spring JDBC
- Thymeleaf
- H2

