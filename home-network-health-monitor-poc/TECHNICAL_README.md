# Home Network Health Monitor: Technical Design

## Problem Statement

Connectivity probes arrive late, duplicate, and alternate rapidly during outages. Arrival-order processing and per-failure alerts produce wrong windows and alert storms.

## Architecture Overview

`Probe agents -> Kafka -> idempotent ingest -> event-time rollups -> incident correlation -> alerts`, with PostgreSQL persistence and Redis projections.

## Core Data Model

Targets identify WAN, router, and devices. Probes retain event and receive times. Rollups store quality windows. Incidents group failures until recovery. Alerts use incident/kind dedupe keys. Jobs rebuild views or enforce retention.

## Event Flow

The handler validates and deduplicates `targetId:eventId`, stores the probe, rebuilds event-time windows, then replays each target stream. Failure opens an incident, consecutive failures increment it, and success resolves it. Rebuilds create fresh projection state while preserving incident identity so counts and alert deduplication remain replay-safe.

## Key Tradeoffs

Full replay is deterministic but should become incremental with checkpoints. Fixed windows are transparent but production needs watermarks and allowed lateness. Consecutive-failure grouping limits noise but should support configurable hysteresis.

## Failure Handling

Stable event keys absorb duplicates, alert keys suppress repeats, projection jobs repair views, retry states expose worker failures, and adapters degrade to memory mode.

## Scaling Path

Partition by household and target, use TimescaleDB hypertables, maintain incremental windows with watermarks, checkpoint incidents, split consumer groups, and archive raw probes.

## What Is Intentionally Simplified

One network, synthetic probes, fixed windows, no authentication or agent enrollment, and in-process workers.
