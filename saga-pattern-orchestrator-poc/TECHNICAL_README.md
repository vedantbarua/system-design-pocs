# Technical Notes

## Architecture
- `SagaOrchestratorService` is the central decision-maker. It starts the saga, listens to domain events, and emits the next command.
- `InventoryService`, `PaymentService`, and `ShippingService` are isolated workers. They do not call each other directly.
- RabbitMQ is the transport boundary. Commands and events are published on `saga.exchange` and routed by topic key.

## Queues
- `saga.inventory.commands`
- `saga.payment.commands`
- `saga.shipping.commands`
- `saga.orchestrator.events`

## Happy Path
1. Client starts checkout.
2. Orchestrator publishes `RESERVE_STOCK_COMMAND`.
3. Inventory reserves units and publishes `STOCK_RESERVED_EVENT`.
4. Orchestrator publishes `CHARGE_CARD_COMMAND`.
5. Payment succeeds and publishes `CARD_CHARGED_EVENT`.
6. Orchestrator publishes `SHIP_PACKAGE_COMMAND`.
7. Shipping publishes `PACKAGE_SHIPPED_EVENT`.
8. Saga finishes as `COMPLETED`.

## Compensation Path
1. Checkout starts and inventory reserves stock.
2. Payment publishes `CARD_CHARGE_FAILED_EVENT`.
3. Orchestrator marks the saga as `COMPENSATING`.
4. Orchestrator publishes `RELEASE_STOCK_COMMAND`.
5. Inventory restores the reserved quantity and publishes `STOCK_RELEASED_EVENT`.
6. Saga finishes as `COMPENSATED`.

## Why This Matters
- No distributed lock coordinates inventory and payment.
- No two-phase commit spans the services.
- Temporary inconsistency is accepted, then corrected through broker-driven compensation.
- The orchestrator gives one clear place to reason about retries, timeouts, and auditability.

## Simplifications
- Services run inside one Spring Boot app for easier local execution.
- Shipping is modeled as always successful.
- Persistence is in-memory, so there is no recovery after restart.

## Good Next Steps
- Add durable saga persistence and replay support.
- Add retry policies with dead-letter queues.
- Add idempotency keys per command handler.
- Split services into separate deployables while preserving the broker contract.
