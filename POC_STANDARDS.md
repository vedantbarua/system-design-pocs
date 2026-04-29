# POC Standards

This repository already has enough breadth. The priority now is consistency.

Use this checklist when creating a new POC or upgrading an older one.

## Required Files

Every POC should include:

- `README.md`
- `TECHNICAL_README.md`
- `IMPROVEMENTS.md`

## README Standard

The project `README.md` should answer the fast questions first.

Required sections:

1. Title and one-sentence summary
2. Goal
3. What it covers
4. Quick start
5. UI flows or demo flows
6. JSON or WebSocket endpoints
7. Configuration
8. Notes and limitations
9. Technologies used

Good README rule:

- A reviewer should understand the value of the POC in under two minutes.

## TECHNICAL_README Standard

The `TECHNICAL_README.md` should explain how the system works internally.

Required sections:

1. Problem statement
2. Architecture overview
3. Core data model
4. Request or event flow
5. Key tradeoffs
6. Failure handling
7. Scaling path
8. What is intentionally simplified

Good technical doc rule:

- It should explain why the design was chosen, not just what endpoints exist.

## IMPROVEMENTS Standard

The `IMPROVEMENTS.md` should be concrete and prioritized.

Required sections:

1. Production gaps
2. Reliability improvements
3. Scaling improvements
4. Security improvements
5. Testing improvements

Good improvements doc rule:

- Prefer specific next steps over generic statements like "make it better."

## Implementation Expectations

A strong POC usually demonstrates at least one meaningful systems concept, not just CRUD.

Examples:

- Ordering guarantees
- Idempotency
- Partitioning and sharding
- Backpressure
- Retry semantics
- Leasing and timeouts
- Leader election
- Rebuild or replay
- Caching and invalidation
- Replication or failover

## UI Expectations

If a POC has a UI, it should help explain system behavior.

Good UI signals:

- Clear state transitions
- Recent events or audit trail
- Failure simulation controls
- Cluster or shard visibility
- Live metrics or counters

Avoid:

- UI that only wraps basic CRUD forms
- Screens with no operational insight

## Portfolio Curation Rules

When deciding whether a POC belongs in the featured set:

- Prefer infrastructure and systems-heavy demos over duplicate app clones
- Prefer breadth across domains over multiple versions of the same idea
- Prefer POCs with both a runnable demo and a strong technical explanation
- Prefer systems that expose tradeoffs, failure modes, or scaling behavior

## Current Upgrade Priorities

The fastest repo-wide improvement is to bring these lagging projects up to the standard because they are already strong topics:

- `api-gateway-dynamic-routing-poc`
- `distributed-job-scheduler-poc`
- `distributed-lock-manager-poc`
- `distributed-log-monitoring-and-alerting-system-poc`
- `distributed-tracing-observability-poc`
- `fault-tolerant-leader-election-poc`
- `notification-system-poc`
- `stock-exchange-poc`

These are good topics. They should look as complete in documentation as the strongest Spring Boot POCs.
