# Vehicle Maintenance And Fuel Tracker: Technical Design

## Problem Statement

Vehicle readings arrive from manual entry, fuel receipts, and devices that may sync late. Processing by arrival order can create impossible odometer histories and incorrect fuel economy, while dropping every lower reading would reject valid delayed events.

## Architecture Overview

```text
React dashboard -> Express API -> Kafka / memory broker
                                      |
                            ordered event projector
                               |             |
                       fuel projection   service scanner
                               |             |
                         PostgreSQL + Redis + reminders
```

## Core Data Model

- `VehicleEvent`: immutable event time, receive time, mileage, payload, and applied/quarantined result.
- `FuelEconomy`: distance between consecutive full fills divided by current gallons.
- `ServiceRule`: last service baseline plus mileage and day intervals.
- `ServiceDue`: derived remaining mileage, remaining days, and status.
- `VehicleJob`, `Reminder`, and `Audit`: operational state and traceability.

## Event Flow

1. Validate vehicle identity, event ID, mileage, and type-specific fields.
2. Deduplicate by `vehicleId:eventId`.
3. Insert the event and sort by event time, then receive time.
4. Replay each vehicle stream from its starting odometer.
5. Quarantine an event when mileage regresses relative to the preceding valid event.
6. Rebuild fuel economy from valid full-tank fills.
7. Persist the event and derived snapshot.

Delayed readings are valid when their event time places them before higher readings. A lower reading timestamped after higher mileage is quarantined but retained for audit and repair.

## Key Tradeoffs

- Full replay is clear and deterministic but should become incremental with checkpoints at scale.
- Event-time ordering handles delayed sync but requires clock-quality and tie-breaking policy.
- Quarantine preserves evidence; automatic correction would risk hiding device or entry errors.
- Dual mileage/time rules model real maintenance better than one deadline, but production needs manufacturer-specific schedules and severe-use profiles.

## Failure Handling

- Stable event keys absorb duplicate delivery.
- Quarantine isolates invalid readings without corrupting projections.
- Reminder keys prevent duplicate alerts during repeated scans.
- Jobs retain attempts and errors and can rebuild every derived view.
- Infrastructure failures degrade to seeded memory mode.

## Scaling Path

Partition Kafka and tables by vehicle ID, checkpoint projections, apply optimistic stream versions, split workers by projection, persist an atomic outbox, and archive cold telemetry while retaining service summaries.

## What Is Intentionally Simplified

One vehicle, fixed units, no authentication, no device identity, no correction workflow, no receipt objects, in-process workers, and snapshot persistence.
