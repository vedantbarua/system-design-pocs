# Medication Refill and Adherence Technical README

## Problem Statement

A medication organizer combines wall-clock schedules, user confirmations, mutable supply counts, refill workflows, notifications, and delegated access. The difficult parts are avoiding duplicate dose occurrences around retries, converting local schedules safely across daylight-saving transitions, preventing command replay from consuming inventory twice, and escalating missed events without sending duplicate notifications.

## Architecture Overview

```text
React care workspace
        |
        v
FastAPI control plane
        |
        +-- timezone schedule materializer
        +-- dose state machine
        +-- inventory and refill ledgers
        +-- caregiver authorization
        +-- notification scheduler and worker
        +-- adherence projection and audit
        |
        +--> PostgreSQL JSONB state snapshot
        +--> Redis pending-job mirror
```

`backend/core.py` owns deterministic domain behavior and has no infrastructure dependency. `backend/adapters.py` enables PostgreSQL and Redis together when both URLs are configured; otherwise the same API runs in memory mode.

## Core Data Model

### Medication

- Household and patient identity
- Name, strength, form, and instructions
- Local schedule times and IANA timezone
- Start and optional end date
- Quantity, units per dose, and refill threshold
- Prescriber, pharmacy, and current prescription

### Dose Occurrence

- Deterministic key from medication, local date, and local time
- Local schedule fields plus normalized UTC timestamp
- Scheduled, taken, skipped, or missed state
- Resolver identity, timestamp, and optional note

### Inventory Entry

- Signed quantity delta
- Resulting balance
- Reason, actor, and timestamp
- Unique external reference for replay protection

### Refill

- Requested quantity and requester
- Requested, ordered, ready, completed, or canceled state
- Idempotency key and completion timestamp

### Notification Job

- Reminder, escalation, refill, or low-supply type
- Deduplication key and structured payload
- Ready, processing, retry, completed, or dead state
- Attempt count and last provider error

## Schedule Materialization

1. The scheduler selects a household-local calendar date.
2. Each active medication contributes its configured local wall-clock times.
3. Python `zoneinfo` converts each local occurrence to UTC using the correct offset for that date.
4. The key `medication + local date + local time` prevents duplicate occurrence creation.
5. Existing occurrences are preserved when the scheduler replays.

The local key is the domain identity. The UTC timestamp is the execution coordinate.

## Dose and Inventory Flow

1. A patient or caregiver submits a taken or skipped command with an idempotency key.
2. The service returns the cached result when the command key has already executed.
3. A taken transition creates one negative inventory entry keyed by dose ID.
4. A skipped transition does not alter inventory.
5. Negative inventory is rejected.
6. Both the dose transition and inventory adjustment append audit events.

The command key protects API replay. The inventory reference separately protects the ledger from duplicate side effects.

## Scheduler and Delivery Flow

1. Due occurrences inside the grace period create reminder jobs.
2. Occurrences beyond the grace period transition to missed and create escalation jobs.
3. Low-supply medications create daily deduplicated alert jobs.
4. A worker claims a ready or retry job.
5. Provider failure moves the job to retry or dead after the attempt limit.
6. Successful sends create recipient-specific delivery records.
7. Delivery deduplication keys prevent duplicate sends if a completed job is replayed.

Missed-dose escalation targets both owners and caregivers. Other jobs target the patient in this POC.

## Refill Workflow

Only one active refill can exist for a medication. Request replay returns either the matching idempotency record or the existing open refill. Completing a refill creates one positive inventory ledger entry keyed by refill ID.

## Authorization Model

- `OWNER`: full household workflow access
- `CAREGIVER`: resolve doses, adjust inventory, request or advance refills, and add prescription versions
- `VIEWER`: inspect medication and adherence state

The POC uses household-wide roles. A production system should support patient consent, medication-level grants, revocation, and emergency-access policies.

## Key Tradeoffs

- Daily schedule times keep recurrence understandable but exclude complex interval and as-needed rules.
- A JSONB snapshot makes infrastructure activation simple but is not a normalized transactional schema.
- Redis mirrors jobs for visibility while the deterministic worker runs in process.
- Adherence is a transparent event ratio, not a clinical interpretation.
- Notification delivery is simulated so retry and deduplication behavior remains deterministic.

## Failure Handling

- Duplicate schedule scans create no additional doses.
- Replayed dose commands do not consume inventory twice.
- Duplicate refill requests return the open workflow.
- Inventory cannot become negative.
- Notification failures retry up to three attempts.
- Recipient delivery keys suppress duplicate sends.
- Missing PostgreSQL or Redis falls back to memory mode.
- Worker drains are bounded.

## Scaling Path

- Normalize medications, schedules, occurrences, ledgers, refills, jobs, deliveries, memberships, and audit events.
- Partition occurrence materialization by household timezone and date.
- Use Redis Streams consumer groups or a durable queue with leases and dead-letter handling.
- Publish domain changes through a transactional outbox.
- Build adherence and supply projections from immutable event streams.
- Add provider-specific notification rate limiting.
- Separate operational and analytical storage.
- Add reconciliation for inventory drift and stuck refill workflows.

## What Is Intentionally Simplified

- No real authentication or consent capture
- No external pharmacy or prescribing integration
- No medical decision support
- No as-needed, taper, alternating-day, or interval recurrence
- No native mobile push service
- No normalized PostgreSQL schema
- No multi-region scheduling
- No compliance certification or protected-health-information controls
