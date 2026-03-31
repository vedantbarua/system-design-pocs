# System Design POCs

A curated repository of system design proof-of-concepts spanning distributed systems primitives, infrastructure building blocks, and product-style applications.

This repo currently contains `57` POCs. The right next step is not adding many more folders. It is presenting the strongest work clearly and bringing the rest up to a consistent quality bar.

## Featured Portfolio

If someone only looks at 12 to 15 projects, start here.

| POC | Why it matters |
| --- | --- |
| [distributed-cache-poc](distributed-cache-poc/README.md) | Covers sharding, replication, failover, TTL, and eviction in one place. |
| [message-queue-poc](message-queue-poc/README.md) | Strong event backbone demo with partitions, consumer groups, retries, replay, and DLQ. |
| [distributed-stream-processing-poc](distributed-stream-processing-poc/README.md) | Good follow-on to the queue with windows, checkpoints, and replay. |
| [event-sourcing-cqrs-poc](event-sourcing-cqrs-poc/README.md) | Demonstrates write/read model separation, snapshots, and rebuild mechanics. |
| [object-storage-poc](object-storage-poc/README.md) | Useful storage-system coverage: buckets, multipart upload, versioning, presigned access. |
| [cdn-poc](cdn-poc/README.md) | Complements object storage with cache locality, invalidation, and edge delivery. |
| [search-engine-poc](search-engine-poc/README.md) | Good indexing and fanout example beyond simple CRUD apps. |
| [distributed-lock-manager-poc](distributed-lock-manager-poc/README.md) | Shows practical coordination using leases, Lua-safe release, and fencing tokens. |
| [fault-tolerant-leader-election-poc](fault-tolerant-leader-election-poc/README.md) | Covers leader failover and cluster coordination basics. |
| [distributed-job-scheduler-poc](distributed-job-scheduler-poc/README.md) | Strong control-plane example with timing wheel scheduling and sharded execution. |
| [feature-flag-config-poc](feature-flag-config-poc/README.md) | Real production concern: config propagation, targeting, and rollout control. |
| [distributed-tracing-observability-poc](distributed-tracing-observability-poc/README.md) | Important operational visibility story across services. |
| [stock-exchange-poc](stock-exchange-poc/README.md) | Nice low-latency deterministic processing example. |
| [saga-pattern-orchestrator-poc](saga-pattern-orchestrator-poc/README.md) | Demonstrates distributed workflow coordination and compensation. |
| [notification-system-poc](notification-system-poc/README.md) | Good example of queueing, rate limits, provider routing, and delivery semantics. |

## Suggested Review Order

This order moves from fundamentals to higher-level systems.

1. [key-value-store-poc](key-value-store-poc/README.md)
2. [rate-limiter-poc](rate-limiter-poc/README.md)
3. [consistent-hashing-poc](consistent-hashing-poc/README.md)
4. [unique-id-generator-in-distributed-systems-poc](unique-id-generator-in-distributed-systems-poc/README.md)
5. [distributed-cache-poc](distributed-cache-poc/README.md)
6. [distributed-lock-manager-poc](distributed-lock-manager-poc/README.md)
7. [fault-tolerant-leader-election-poc](fault-tolerant-leader-election-poc/README.md)
8. [message-queue-poc](message-queue-poc/README.md)
9. [distributed-stream-processing-poc](distributed-stream-processing-poc/README.md)
10. [event-sourcing-cqrs-poc](event-sourcing-cqrs-poc/README.md)
11. [saga-pattern-orchestrator-poc](saga-pattern-orchestrator-poc/README.md)
12. [object-storage-poc](object-storage-poc/README.md)
13. [cdn-poc](cdn-poc/README.md)
14. [search-engine-poc](search-engine-poc/README.md)
15. [stock-exchange-poc](stock-exchange-poc/README.md)

## Repository Gaps Worth Filling

Do not add more adjacent product clones until these are covered.

- Database replication and quorum semantics
- Service discovery plus load balancing
- Authentication, authorization, sessions, and token lifecycle

## Full Catalog

### Distributed Systems Primitives

- [consistent-hashing-poc](consistent-hashing-poc/README.md)
- [distributed-cache-poc](distributed-cache-poc/README.md)
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
- [distributed-job-scheduler-poc](distributed-job-scheduler-poc/README.md)
- [distributed-log-monitoring-and-alerting-system-poc](distributed-log-monitoring-and-alerting-system-poc/README.md)
- [distributed-tracing-observability-poc](distributed-tracing-observability-poc/README.md)
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
- [ticketmaster-poc](ticketmaster-poc/README.md)
- [uber-poc](uber-poc/README.md)
- [yelp-poc](yelp-poc/README.md)

### Consumer Product Simulations

- [facebook-news-feed-poc](facebook-news-feed-poc/README.md)
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

## Quality Bar

The repo is in decent shape, but not fully standardized yet.

- `57/57` POCs have a `README.md`
- `47/57` POCs have a `TECHNICAL_README.md`
- `36/57` POCs have an `IMPROVEMENTS.md`

Use [POC_STANDARDS.md](POC_STANDARDS.md) as the target format for future cleanup.
