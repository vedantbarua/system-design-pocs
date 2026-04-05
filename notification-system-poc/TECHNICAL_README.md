# Technical README

## Problem Statement

A notification system has to manage more than message formatting. It needs queueing, prioritization, provider protection, duplicate suppression, retry behavior, and enough operational visibility to explain why a message was delayed or dropped. This POC focuses on those mechanics.

## Architecture Overview

The backend models a control plane for three notification channels:

- SMS
- email
- push

Each channel owns a topic queue. Providers poll their channel queue at a fixed interval, subject to a token-bucket rate limiter. Templates are stored separately and rendered at enqueue time. The frontend acts as an operator console for templates, dispatch controls, providers, queues, and recent deliveries.

## Core Data Model

- `templates`: channel-specific message templates with subject, body, and variable list
- `notifications`: full notification history with status, attempts, provider, and timestamps
- `topics`: per-channel priority queues waiting for dispatch
- `providers`: provider definitions with channel, token-bucket rate limits, and failure rate
- `dedupeIndex`: recent dedupe keys scoped by channel
- `events`: bounded operational event stream

## Request and Event Flow

### Enqueue path

1. A client creates or selects a template.
2. `POST /api/notifications` validates the request and checks deduplication state.
3. The backend creates a queued notification and appends it to history.
4. The notification is inserted into the channel queue by priority and creation time.

### Dispatch path

1. Each provider polls its channel queue on a timer.
2. The token bucket must have capacity before a message is popped.
3. The notification transitions to `sending` and records the provider id.
4. A simulated delivery either succeeds or fails after randomized latency.

### Retry path

1. Failed notifications increment their attempt count.
2. If attempts remain, the system marks the notification `retrying`.
3. After a delay, the same notification is re-enqueued into its channel queue.

## Key Tradeoffs

- Priority queues make urgent delivery visible, but fairness across tenants is not modeled.
- Token buckets are lightweight and intuitive, but they do not capture provider-specific error feedback loops.
- In-memory dedupe is sufficient for demo behavior, but it does not survive restart or cross-node fanout.
- At-least-once retry is simpler than exactly-once delivery, but consumers must tolerate duplicates when dedupe keys are absent.

## Failure Handling

- Invalid template or notification requests are rejected at the API layer.
- Provider rate limits delay dispatch rather than dropping work.
- Randomized provider failure triggers retry until `maxAttempts` is exhausted.
- Pause and resume controls let the UI simulate intentional dispatch backpressure.

## Scaling Path

To move toward production:

- move queues and notification history into a durable broker and datastore
- add provider fallback and routing policies per region or tenant
- add outbox semantics and idempotency keys for delivery confirmation
- partition queues by tenant, campaign, or provider
- add delivery analytics, bounce handling, and unsubscribe state

## What Is Intentionally Simplified

- one process models the whole system
- no real external providers or callbacks
- no durable retries or dead-letter queue
- no user preference engine or opt-out model
- no tenant isolation or per-customer quotas
