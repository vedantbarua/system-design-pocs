# Technical README

## Problem Statement

A log platform has to do more than accept text. It needs to normalize timestamps, remove sensitive content, enrich context, evaluate alert rules, and expose current operational state. This POC focuses on that ingestion-to-alert path in a compact single-node design.

## Architecture Overview

The system has two layers:

- a Spring Boot server that ingests logs, transforms them, stores them, and evaluates alert rules
- a React client that submits sample logs and visualizes stored logs plus active alerts

The server composes several design patterns:

- factory-backed collector entry point
- chain-of-responsibility transformation pipeline
- strategy-style filters for alert matching
- observer sinks for alert delivery

## Core Data Model

- `LogEntry`: source, module, level, message, timestamps, and metadata
- `AlertRule`: rule name, threshold, and filter strategy
- `Alert`: triggered rule information, message, timestamp, and metadata snapshot
- `LogStore`: bounded in-memory history of processed logs
- `AlertStore`: in-memory list of current alerts

## Request and Event Flow

### Ingestion path

1. `POST /api/logs` accepts a log payload.
2. The controller hands the event to the collector and processing service.
3. The transformer chain applies PII scrubbing, timestamp normalization, and metadata enrichment.
4. The transformed entry is stored in the bounded log store.
5. The alerting service evaluates the entry against registered rules.

### Alert path

1. Each rule checks whether its filter matches the transformed log.
2. Matching rules increment an in-memory counter.
3. Once the threshold is met, the rule emits an alert and resets its counter.
4. Observers fan the alert out to console output and the in-memory alert store.

## Key Tradeoffs

- Synchronous processing keeps the demo easy to reason about, but it hides the buffering and backpressure concerns of real log pipelines.
- In-memory counters make alert logic obvious, but they do not survive restart and are not time-window aware.
- Rule composition is flexible enough for the demo, but it is not yet a general query language.
- A bounded local store is enough for a dashboard, but it is not a replacement for search or retention infrastructure.

## Failure Handling

- Invalid requests are rejected by the API layer.
- If an alert rule does not match, the log is still preserved in the store.
- Alert sinks are local and synchronous, so the design does not yet isolate observer failure.
- Restart clears log history, alert state, and rule counters.

## Scaling Path

To move this toward production:

- decouple ingestion from processing with a durable queue or stream
- partition logs by tenant, service, or topic
- add indexed search and long-term retention storage
- support rolling time windows and richer aggregation in alert rules
- add multi-sink delivery such as PagerDuty, Slack, or email

## What Is Intentionally Simplified

- single process and single in-memory store
- no query language or retention policy engine
- no sampling, batching, or backpressure controls
- no user management or tenant isolation
- no historical metrics or dashboards beyond recent state
