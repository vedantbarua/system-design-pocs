# System Design POCs

Proof-of-concepts for distributed systems, infrastructure patterns, and product-style architectures. This repository is meant to read like a working systems portfolio, not just a list of folders.

There are currently `66` POCs here. Some are infrastructure primitives, some are realtime systems, and some are end-user product simulations. The common goal is the same: make the underlying system behavior visible enough that someone can understand the design tradeoffs quickly.

## What Makes This Repo Useful

- Runnable demos instead of design-only notes
- Strong coverage of distributed systems building blocks
- A mix of APIs, dashboards, and realtime flows
- Technical follow-up docs in many folders for deeper review

## Start Here

If a reviewer only opens a dozen projects, these are the best entry points.

| POC | Why it stands out |
| --- | --- |
| [distributed-cache-poc](distributed-cache-poc/README.md) | Sharding, replication, failover, TTLs, and eviction in one concrete demo. |
| [message-queue-poc](message-queue-poc/README.md) | Good event backbone example with partitions, consumer groups, retry, replay, and DLQ behavior. |
| [distributed-stream-processing-poc](distributed-stream-processing-poc/README.md) | Useful continuation of queueing concepts with windows, checkpoints, and replay. |
| [event-sourcing-cqrs-poc](event-sourcing-cqrs-poc/README.md) | Clear write/read separation, snapshotting, and rebuild mechanics. |
| [object-storage-poc](object-storage-poc/README.md) | Strong storage-system coverage: buckets, multipart uploads, versioning, and presigned access. |
| [cdn-poc](cdn-poc/README.md) | Good edge caching story with invalidation, TTLs, and regional cache behavior. |
| [search-engine-poc](search-engine-poc/README.md) | Indexing, retrieval, and fanout beyond simple CRUD apps. |
| [distributed-lock-manager-poc](distributed-lock-manager-poc/README.md) | Practical coordination demo using leases, safe release, and fencing tokens. |
| [fault-tolerant-leader-election-poc](fault-tolerant-leader-election-poc/README.md) | Good cluster coordination and failover fundamentals. |
| [database-replication-quorum-poc](database-replication-quorum-poc/README.md) | Strong consistency tradeoff demo with quorum reads and writes, stale replicas, and repair paths. |
| [distributed-job-scheduler-poc](distributed-job-scheduler-poc/README.md) | Useful control-plane example with timing, sharding, and worker assignment. |
| [feature-flag-config-poc](feature-flag-config-poc/README.md) | Good production-focused system for rollout control and config propagation. |
| [service-discovery-load-balancing-poc](service-discovery-load-balancing-poc/README.md) | Lease-based discovery, routing, sticky sessions, draining, and temporary ejection. |
| [distributed-tracing-observability-poc](distributed-tracing-observability-poc/README.md) | Important operational visibility story across services. |
| [stock-exchange-poc](stock-exchange-poc/README.md) | Strong deterministic processing example with ordered ingress and live market updates. |
| [saga-pattern-orchestrator-poc](saga-pattern-orchestrator-poc/README.md) | Distributed workflow coordination with compensation logic. |
| [notification-system-poc](notification-system-poc/README.md) | Real messaging-system concerns: queueing, provider routing, delivery semantics, and rate limits. |

## Suggested Review Path

This path moves from core primitives to more layered systems.

1. [key-value-store-poc](key-value-store-poc/README.md)
2. [rate-limiter-poc](rate-limiter-poc/README.md)
3. [consistent-hashing-poc](consistent-hashing-poc/README.md)
4. [unique-id-generator-in-distributed-systems-poc](unique-id-generator-in-distributed-systems-poc/README.md)
5. [distributed-cache-poc](distributed-cache-poc/README.md)
6. [distributed-lock-manager-poc](distributed-lock-manager-poc/README.md)
7. [fault-tolerant-leader-election-poc](fault-tolerant-leader-election-poc/README.md)
8. [database-replication-quorum-poc](database-replication-quorum-poc/README.md)
9. [service-discovery-load-balancing-poc](service-discovery-load-balancing-poc/README.md)
10. [message-queue-poc](message-queue-poc/README.md)
11. [distributed-stream-processing-poc](distributed-stream-processing-poc/README.md)
12. [event-sourcing-cqrs-poc](event-sourcing-cqrs-poc/README.md)
13. [saga-pattern-orchestrator-poc](saga-pattern-orchestrator-poc/README.md)
14. [object-storage-poc](object-storage-poc/README.md)
15. [cdn-poc](cdn-poc/README.md)
16. [search-engine-poc](search-engine-poc/README.md)
17. [stock-exchange-poc](stock-exchange-poc/README.md)

## Repo Layout

### Distributed Systems Primitives

- [consistent-hashing-poc](consistent-hashing-poc/README.md)
- [distributed-cache-poc](distributed-cache-poc/README.md)
- [database-replication-quorum-poc](database-replication-quorum-poc/README.md)
- [distributed-lock-manager-poc](distributed-lock-manager-poc/README.md)
- [event-sourcing-cqrs-poc](event-sourcing-cqrs-poc/README.md)
- [fault-tolerant-leader-election-poc](fault-tolerant-leader-election-poc/README.md)
- [feature-flag-config-poc](feature-flag-config-poc/README.md)
- [key-value-store-poc](key-value-store-poc/README.md)
- [message-queue-poc](message-queue-poc/README.md)
- [rate-limiter-poc](rate-limiter-poc/README.md)
- [resilient-flow-poc](resilient-flow-poc/README.md)
- [saga-pattern-orchestrator-poc](saga-pattern-orchestrator-poc/README.md)
- [unique-id-generator-in-distributed-systems-poc](unique-id-generator-in-distributed-systems-poc/README.md)

### Data, Search, and Storage

- [cdn-poc](cdn-poc/README.md)
- [design-dropbox-poc](design-dropbox-poc/README.md)
- [distributed-stream-processing-poc](distributed-stream-processing-poc/README.md)
- [google-docs-poc](google-docs-poc/README.md)
- [object-storage-poc](object-storage-poc/README.md)
- [search-autocomplete-system-poc](search-autocomplete-system-poc/README.md)
- [search-engine-poc](search-engine-poc/README.md)
- [web-crawler-poc](web-crawler-poc/README.md)

### Operations and Platform

- [ad-click-aggregator-poc](ad-click-aggregator-poc/README.md)
- [api-gateway-dynamic-routing-poc](api-gateway-dynamic-routing-poc/README.md)
- [dark-mode-plugin-poc](dark-mode-plugin-poc/README.md)
- [distributed-job-scheduler-poc](distributed-job-scheduler-poc/README.md)
- [distributed-log-monitoring-and-alerting-system-poc](distributed-log-monitoring-and-alerting-system-poc/README.md)
- [distributed-tracing-observability-poc](distributed-tracing-observability-poc/README.md)
- [service-discovery-load-balancing-poc](service-discovery-load-balancing-poc/README.md)
- [notification-system-poc](notification-system-poc/README.md)
- [stock-exchange-poc](stock-exchange-poc/README.md)

### Realtime Collaboration and Workflows

- [chat-system-poc](chat-system-poc/README.md)
- [collaborative-whiteboard-poc](collaborative-whiteboard-poc/README.md)
- [confluence-poc](confluence-poc/README.md)
- [flashconf-poc](flashconf-poc/README.md)
- [real-time-kanban-poc](real-time-kanban-poc/README.md)
- [real-time-sync-engine-poc](real-time-sync-engine-poc/README.md)
- [sprint-retrospective-poc](sprint-retrospective-poc/README.md)
- [teams-poc](teams-poc/README.md)

### Marketplace, Commerce, and Financial Flows

- [backmarket-poc](backmarket-poc/README.md)
- [local-delivery-service-poc](local-delivery-service-poc/README.md)
- [online-auction-poc](online-auction-poc/README.md)
- [online-shopping-poc](online-shopping-poc/README.md)
- [payment-system-poc](payment-system-poc/README.md)
- [point-of-sale-poc](point-of-sale-poc/README.md)
- [price-tracker-poc](price-tracker-poc/README.md)
- [restaurant-booking-system-poc](restaurant-booking-system-poc/README.md)
- [ticketmaster-poc](ticketmaster-poc/README.md)
- [uber-poc](uber-poc/README.md)
- [yelp-poc](yelp-poc/README.md)

### Consumer Product Simulations

- [facebook-news-feed-poc](facebook-news-feed-poc/README.md)
- [bar-menu-poc](bar-menu-poc/README.md)
- [flight-tracking-poc](flight-tracking-poc/README.md)
- [leetcode-poc](leetcode-poc/README.md)
- [medium-poc](medium-poc/README.md)
- [netflix-poc](netflix-poc/README.md)
- [news-feed-system-poc](news-feed-system-poc/README.md)
- [parking-meter-poc](parking-meter-poc/README.md)
- [strava-poc](strava-poc/README.md)
- [tinder-poc](tinder-poc/README.md)
- [url-shortner-poc](url-shortner-poc/README.md)
- [workout-tracker-poc](workout-tracker-poc/README.md)
- [youTube-top-K-poc](youTube-top-K-poc/README.md)

## How To Read A Project Folder

For the strongest review signal, open files in this order:

1. `README.md` for the fast explanation and demo flow
2. `TECHNICAL_README.md` or `TECHNICAL_DOC.md` for architecture and tradeoffs
3. `IMPROVEMENTS.md` for the path from POC to production

## Current Standard

The repository direction is to make every project easy to scan in under two minutes and deep enough to discuss in an interview or portfolio review.

- `66/66` POCs have a `README.md`
- `63/66` POCs have a technical companion doc
- `55/66` POCs have an `IMPROVEMENTS.md`

Use [POC_STANDARDS.md](POC_STANDARDS.md) as the baseline for future additions and cleanup.
