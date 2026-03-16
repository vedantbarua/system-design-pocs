# Saga Pattern Orchestrator POC

Spring Boot proof-of-concept for an e-commerce checkout saga coordinated by an orchestrator over RabbitMQ.

## Scenario
- Step 1: Reserve stock
- Step 2: Charge card
- Step 3: Ship package
- Compensation: If card charging fails, emit a compensating command to release the reserved stock

## Features
- RabbitMQ-backed command and event flow
- Explicit saga state machine with in-memory order tracking
- Inventory, payment, and shipping services communicating only through broker messages
- Compensation path that restores stock when payment fails
- Dashboard plus JSON APIs for running and observing the saga

## How to Run
1. Ensure Java 17+, Maven, and Docker are installed.
2. Start RabbitMQ:
   ```bash
   cd saga-pattern-orchestrator-poc
   docker compose up -d
   ```
3. Start the app:
   ```bash
   mvn spring-boot:run
   ```
4. Open `http://localhost:8106`.

RabbitMQ management UI is available at `http://localhost:15672` with `guest` / `guest`.

## API Endpoints

### Start a successful checkout
```bash
curl -X POST http://localhost:8106/api/checkouts \
  -H "Content-Type: application/json" \
  -d '{"customerId":"cust-101","sku":"LAPTOP-15","quantity":1,"amount":1499.99,"simulatePaymentFailure":false}'
```

### Start a failing checkout that triggers compensation
```bash
curl -X POST http://localhost:8106/api/checkouts \
  -H "Content-Type: application/json" \
  -d '{"customerId":"cust-202","sku":"HEADPHONES-02","quantity":2,"amount":199.99,"simulatePaymentFailure":true}'
```

### Inspect current saga state
```bash
curl http://localhost:8106/api/sagas
```

### Inspect recent broker-driven events
```bash
curl http://localhost:8106/api/events
```

## Notes
- All business state is in-memory and resets on restart.
- The broker is real RabbitMQ; the services are simulated in-process for a compact interview-ready POC.
- The design favors eventual consistency over distributed locks or XA transactions.

See `TECHNICAL_README.md` for the event choreography details.
