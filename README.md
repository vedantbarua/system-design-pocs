# System Design POCs

Proof-of-concepts for distributed systems, infrastructure patterns, and product-style architectures. This repository is meant to read like a working systems portfolio, not just a list of folders.

There are currently `119` POCs here. Some are infrastructure primitives, some are realtime systems, and some are end-user product simulations. The common goal is the same: make the underlying system behavior visible enough that someone can understand the design tradeoffs quickly.

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
| [cdc-materialized-view-poc](cdc-materialized-view-poc/README.md) | Change Data Capture with connector offsets, replay, backfill, duplicate delivery, and read models. |
| [feature-store-poc](feature-store-poc/README.md) | Python ML platform demo with offline features, online serving, freshness, point-in-time training sets, and skew checks. |
| [data-lineage-governance-poc](data-lineage-governance-poc/README.md) | Data governance with dataset ownership, column PII tags, lineage graph, quality checks, freshness SLAs, policy gates, and impact analysis. |
| [privacy-consent-preferences-poc](privacy-consent-preferences-poc/README.md) | Consent and privacy enforcement with regional defaults, purpose-based decisions, revocation, DSAR workflows, and audit history. |
| [data-retention-lifecycle-poc](data-retention-lifecycle-poc/README.md) | Data retention lifecycle control with policy matching, legal holds, archive/anonymize/delete jobs, and audit history. |
| [data-subject-rights-orchestrator-poc](data-subject-rights-orchestrator-poc/README.md) | DSAR orchestration with service fanout, retries, blockers, export bundles, deletion receipts, SLA tracking, and audit history. |
| [compliance-evidence-automation-poc](compliance-evidence-automation-poc/README.md) | Compliance evidence automation with control registry, evidence freshness, exceptions, audit packages, checksums, and readiness status. |
| [fastapi-redis-task-queue-poc](fastapi-redis-task-queue-poc/README.md) | FastAPI + Redis queue with delayed jobs, rate limits, retries, idempotency, visibility timeouts, and DLQ behavior. |
| [schema-registry-event-contract-poc](schema-registry-event-contract-poc/README.md) | Event schema governance with versioning, compatibility checks, validation, consumer support, and rollout readiness. |
| [policy-as-code-authorization-poc](policy-as-code-authorization-poc/README.md) | Centralized authorization decisions with RBAC, ABAC conditions, deny precedence, dry-run policies, and audit logs. |
| [identity-access-lifecycle-poc](identity-access-lifecycle-poc/README.md) | React, Node, Kafka, PostgreSQL, and Redis identity control plane with SCIM-style synchronization, JIT access, session revocation, access reviews, retries, and audits. |
| [secrets-management-kms-poc](secrets-management-kms-poc/README.md) | Secrets platform with envelope encryption, key rotation, access policies, leases, break-glass access, and audits. |
| [artifact-registry-supply-chain-security-poc](artifact-registry-supply-chain-security-poc/README.md) | Artifact trust with immutable digests, provenance, SBOMs, signatures, scans, promotions, admission gates, and audits. |
| [write-ahead-log-poc](write-ahead-log-poc/README.md) | Compact durability demo with append-before-apply commands, checkpoints, replay, idempotency, and compaction. |
| [object-storage-poc](object-storage-poc/README.md) | Strong storage-system coverage: buckets, multipart uploads, versioning, and presigned access. |
| [cdn-poc](cdn-poc/README.md) | Good edge caching story with invalidation, TTLs, and regional cache behavior. |
| [search-engine-poc](search-engine-poc/README.md) | Indexing, retrieval, and fanout beyond simple CRUD apps. |
| [distributed-lock-manager-poc](distributed-lock-manager-poc/README.md) | Practical coordination demo using leases, safe release, and fencing tokens. |
| [fault-tolerant-leader-election-poc](fault-tolerant-leader-election-poc/README.md) | Good cluster coordination and failover fundamentals. |
| [database-replication-quorum-poc](database-replication-quorum-poc/README.md) | Strong consistency tradeoff demo with quorum reads and writes, stale replicas, and repair paths. |
| [multi-region-active-active-poc](multi-region-active-active-poc/README.md) | Geo-distributed write availability, async replication, outages, vector clocks, and conflict resolution. |
| [anti-entropy-repair-poc](anti-entropy-repair-poc/README.md) | Merkle-style range comparison and targeted repair for divergent replicas. |
| [distributed-job-scheduler-poc](distributed-job-scheduler-poc/README.md) | Useful control-plane example with timing, sharding, and worker assignment. |
| [feature-flag-config-poc](feature-flag-config-poc/README.md) | Good production-focused system for rollout control and config propagation. |
| [kubernetes-controller-reconciliation-poc](kubernetes-controller-reconciliation-poc/README.md) | Desired-state control loop with replica convergence, rolling updates, crash backoff, autoscaling, and events. |
| [service-discovery-load-balancing-poc](service-discovery-load-balancing-poc/README.md) | Lease-based discovery, routing, sticky sessions, draining, and temporary ejection. |
| [service-mesh-control-plane-poc](service-mesh-control-plane-poc/README.md) | East-west traffic control with sidecars, mTLS identity, canary splits, retries, circuit breakers, and ejection. |
| [distributed-tracing-observability-poc](distributed-tracing-observability-poc/README.md) | Important operational visibility story across services. |
| [incident-management-oncall-poc](incident-management-oncall-poc/README.md) | Human operations layer with alert deduplication, on-call escalation, incident timelines, SLO breaches, and action items. |
| [stock-exchange-poc](stock-exchange-poc/README.md) | Strong deterministic processing example with ordered ingress and live market updates. |
| [saga-pattern-orchestrator-poc](saga-pattern-orchestrator-poc/README.md) | Distributed workflow coordination with compensation logic. |
| [transactional-outbox-poc](transactional-outbox-poc/README.md) | Practical reliability pattern for atomic state writes, async publishing, idempotent consumers, duplicate delivery, and DLQ handling. |
| [notification-system-poc](notification-system-poc/README.md) | Real messaging-system concerns: queueing, provider routing, delivery semantics, and rate limits. |
| [subscription-billing-reminder-poc](subscription-billing-reminder-poc/README.md) | Practical recurring billing workflow with subscriptions, invoices, payment attempts, dunning retries, reminders, grace periods, and cancellations. |
| [appointment-scheduling-reminder-poc](appointment-scheduling-reminder-poc/README.md) | Everyday scheduling with availability, expiring holds, conflict-safe booking, rescheduling, waitlist promotion, reminders, and utilization. |
| [shared-expense-splitting-poc](shared-expense-splitting-poc/README.md) | React, Node, and Express shared-expense ledger with multiple split methods, multi-payer expenses, reversals, settlements, recurring costs, and reminders. |
| [home-maintenance-reminder-poc](home-maintenance-reminder-poc/README.md) | React, Node, and Express home maintenance tracker with recurring schedules, warranties, service history, reminders, asset health, and spending. |
| [package-delivery-tracker-poc](package-delivery-tracker-poc/README.md) | React, Node, Express, and Redis parcel tracker with carrier normalization, idempotent event ingestion, out-of-order protection, polling, and delivery alerts. |
| [returns-refunds-tracker-poc](returns-refunds-tracker-poc/README.md) | React, Node, PostgreSQL, and Redis return workflow with deadlines, reverse logistics, provider webhooks, partial refunds, and financial reconciliation. |
| [personal-document-renewal-vault-poc](personal-document-renewal-vault-poc/README.md) | React and FastAPI document vault with short-lived grants, immutable versions, MinIO objects, scan/OCR jobs, access controls, audits, and renewal reminders. |
| [medication-refill-adherence-poc](medication-refill-adherence-poc/README.md) | React and FastAPI medication workflow with timezone-safe dose schedules, idempotent inventory, refill forecasting, caregiver escalation, and retryable Redis jobs. |
| [family-safety-checkin-poc](family-safety-checkin-poc/README.md) | React and FastAPI safety coordination with deadline state machines, offline acknowledgements, expiring location shares, trusted-contact escalation, retries, and WebSockets. |
| [home-utility-usage-monitor-poc](home-utility-usage-monitor-poc/README.md) | React, Node, Express, Kafka, TimescaleDB, and Redis utility monitor with smart-meter ingestion, rollups, anomaly detection, corrections, and retryable alerts. |
| [smart-home-automation-rules-poc](smart-home-automation-rules-poc/README.md) | React, Node, Express, Kafka, Postgres, and Redis automation rule engine with event triggers, command dedupe, safety overrides, retries, acknowledgements, and audit history. |
| [personal-backup-sync-poc](personal-backup-sync-poc/README.md) | React, Node, Express, Kafka, Postgres, and Redis personal backup sync with chunk dedupe, versioned manifests, snapshots, restore jobs, conflicts, retries, and retention. |
| [personal-knowledge-index-poc](personal-knowledge-index-poc/README.md) | React, Node, Express, Kafka, Postgres, and Redis personal knowledge index with document ingestion, full-text search, semantic simulation, access grants, stale scans, retries, and audits. |
| [smart-pantry-inventory-poc](smart-pantry-inventory-poc/README.md) | React, Node, Express, Kafka, Postgres, and Redis household inventory with lot-level expiry, FEFO consumption, low-stock shopping projections, retries, and audits. |
| [household-chore-coordinator-poc](household-chore-coordinator-poc/README.md) | React, Node, Express, Kafka, Postgres, and Redis chore coordination with recurrence, fair assignment, lease fencing, offline replay, overdue escalation, retries, and audits. |
| [personal-cash-flow-forecast-poc](personal-cash-flow-forecast-poc/README.md) | React, Node, Express, Kafka, Postgres, and Redis cash-flow forecasting with bank event reconciliation, recurring detection, budgets, projection rebuilds, retries, and audits. |
| [vehicle-maintenance-fuel-tracker-poc](vehicle-maintenance-fuel-tracker-poc/README.md) | React, Node, Express, Kafka, Postgres, and Redis vehicle care with ordered telemetry, fuel economy, service schedules, quarantine, retries, and audits. |
| [home-network-health-monitor-poc](home-network-health-monitor-poc/README.md) | React, Node, Express, Kafka, Postgres, and Redis connectivity monitoring with event-time rollups, outage correlation, alert deduplication, retention, and retries. |
| [personal-sleep-recovery-tracker-poc](personal-sleep-recovery-tracker-poc/README.md) | React, Node, Express, Kafka, Postgres, and Redis sleep recovery tracker with wearable event ingestion, session rebuilds, recovery scoring, alerts, retries, and audits. |
| [home-air-quality-monitor-poc](home-air-quality-monitor-poc/README.md) | React, Node, Express, Kafka, Postgres, and Redis room-level air quality monitoring with sensor ingestion, rollups, stale detection, incident correlation, alerts, and retries. |
| [pet-care-coordination-poc](pet-care-coordination-poc/README.md) | React, Node, Express, Kafka, Postgres, and Redis pet care coordination with caregiver events, missed-care detection, reminders, duplicate-log alerts, handoffs, and retries. |
| [household-waste-pickup-coordinator-poc](household-waste-pickup-coordinator-poc/README.md) | React, Node, Express, Kafka, Postgres, and Redis waste pickup coordination with route events, holiday shifts, missed pickups, reminders, alert dedupe, and retries. |
| [home-plant-care-monitor-poc](home-plant-care-monitor-poc/README.md) | React, Node, Express, Kafka, Postgres, and Redis plant care monitoring with sensor events, watering schedules, stale sensor detection, reminders, alert dedupe, and retries. |
| [personal-errand-route-planner-poc](personal-errand-route-planner-poc/README.md) | React, Node, Express, Kafka, Postgres, and Redis errand route planner with priority routing, location events, missed windows, stale route alerts, reminders, and retries. |
| [household-mail-triage-poc](household-mail-triage-poc/README.md) | React, Node, Express, Kafka, Postgres, and Redis household mail triage with scanned mail events, duplicate notices, stale inbox detection, due-date alerts, reminders, and retries. |
| [home-warranty-receipt-vault-poc](home-warranty-receipt-vault-poc/README.md) | React, Node, Express, Kafka, Postgres, and Redis warranty receipt vault with duplicate receipt detection, return deadlines, warranty alerts, claim workflows, reminders, and retries. |
| [personal-travel-itinerary-poc](personal-travel-itinerary-poc/README.md) | React, Node, Express, Kafka, Postgres, and Redis travel itinerary planner with booking updates, conflict detection, check-in windows, document deadlines, reminders, and retries. |
| [family-school-activity-coordinator-poc](family-school-activity-coordinator-poc/README.md) | React, Node, Express, Kafka, Postgres, and Redis school activity coordinator with assignments, forms, pickup changes, child conflicts, reminders, and retries. |

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
9. [multi-region-active-active-poc](multi-region-active-active-poc/README.md)
10. [anti-entropy-repair-poc](anti-entropy-repair-poc/README.md)
11. [service-discovery-load-balancing-poc](service-discovery-load-balancing-poc/README.md)
12. [message-queue-poc](message-queue-poc/README.md)
13. [distributed-stream-processing-poc](distributed-stream-processing-poc/README.md)
14. [event-sourcing-cqrs-poc](event-sourcing-cqrs-poc/README.md)
15. [cdc-materialized-view-poc](cdc-materialized-view-poc/README.md)
16. [write-ahead-log-poc](write-ahead-log-poc/README.md)
17. [saga-pattern-orchestrator-poc](saga-pattern-orchestrator-poc/README.md)
18. [transactional-outbox-poc](transactional-outbox-poc/README.md)
19. [object-storage-poc](object-storage-poc/README.md)
20. [cdn-poc](cdn-poc/README.md)
21. [search-engine-poc](search-engine-poc/README.md)
22. [stock-exchange-poc](stock-exchange-poc/README.md)

## Repo Layout

### Distributed Systems Primitives

- [anti-entropy-repair-poc](anti-entropy-repair-poc/README.md)
- [consistent-hashing-poc](consistent-hashing-poc/README.md)
- [distributed-cache-poc](distributed-cache-poc/README.md)
- [database-replication-quorum-poc](database-replication-quorum-poc/README.md)
- [distributed-lock-manager-poc](distributed-lock-manager-poc/README.md)
- [event-sourcing-cqrs-poc](event-sourcing-cqrs-poc/README.md)
- [fault-tolerant-leader-election-poc](fault-tolerant-leader-election-poc/README.md)
- [feature-flag-config-poc](feature-flag-config-poc/README.md)
- [key-value-store-poc](key-value-store-poc/README.md)
- [message-queue-poc](message-queue-poc/README.md)
- [multi-region-active-active-poc](multi-region-active-active-poc/README.md)
- [rate-limiter-poc](rate-limiter-poc/README.md)
- [resilient-flow-poc](resilient-flow-poc/README.md)
- [saga-pattern-orchestrator-poc](saga-pattern-orchestrator-poc/README.md)
- [transactional-outbox-poc](transactional-outbox-poc/README.md)
- [unique-id-generator-in-distributed-systems-poc](unique-id-generator-in-distributed-systems-poc/README.md)
- [write-ahead-log-poc](write-ahead-log-poc/README.md)

### Data, Search, and Storage

- [cdc-materialized-view-poc](cdc-materialized-view-poc/README.md)
- [cdn-poc](cdn-poc/README.md)
- [data-lineage-governance-poc](data-lineage-governance-poc/README.md)
- [design-dropbox-poc](design-dropbox-poc/README.md)
- [distributed-stream-processing-poc](distributed-stream-processing-poc/README.md)
- [google-docs-poc](google-docs-poc/README.md)
- [object-storage-poc](object-storage-poc/README.md)
- [personal-backup-sync-poc](personal-backup-sync-poc/README.md)
- [personal-knowledge-index-poc](personal-knowledge-index-poc/README.md)
- [search-autocomplete-system-poc](search-autocomplete-system-poc/README.md)
- [search-engine-poc](search-engine-poc/README.md)
- [web-crawler-poc](web-crawler-poc/README.md)

### Operations and Platform

- [ad-click-aggregator-poc](ad-click-aggregator-poc/README.md)
- [api-gateway-dynamic-routing-poc](api-gateway-dynamic-routing-poc/README.md)
- [artifact-registry-supply-chain-security-poc](artifact-registry-supply-chain-security-poc/README.md)
- [compliance-evidence-automation-poc](compliance-evidence-automation-poc/README.md)
- [dark-mode-plugin-poc](dark-mode-plugin-poc/README.md)
- [distributed-job-scheduler-poc](distributed-job-scheduler-poc/README.md)
- [distributed-log-monitoring-and-alerting-system-poc](distributed-log-monitoring-and-alerting-system-poc/README.md)
- [distributed-tracing-observability-poc](distributed-tracing-observability-poc/README.md)
- [fastapi-redis-task-queue-poc](fastapi-redis-task-queue-poc/README.md)
- [feature-store-poc](feature-store-poc/README.md)
- [incident-management-oncall-poc](incident-management-oncall-poc/README.md)
- [identity-access-lifecycle-poc](identity-access-lifecycle-poc/README.md)
- [kubernetes-controller-reconciliation-poc](kubernetes-controller-reconciliation-poc/README.md)
- [llm-ai-poc](llm-ai-poc/README.md)
- [llm-context-gateway-poc](llm-context-gateway-poc/README.md)
- [llm-prompt-router-poc](llm-prompt-router-poc/README.md)
- [policy-as-code-authorization-poc](policy-as-code-authorization-poc/README.md)
- [data-retention-lifecycle-poc](data-retention-lifecycle-poc/README.md)
- [data-subject-rights-orchestrator-poc](data-subject-rights-orchestrator-poc/README.md)
- [privacy-consent-preferences-poc](privacy-consent-preferences-poc/README.md)
- [python-ollama-poc](python-ollama-poc/README.md)
- [schema-registry-event-contract-poc](schema-registry-event-contract-poc/README.md)
- [secrets-management-kms-poc](secrets-management-kms-poc/README.md)
- [service-discovery-load-balancing-poc](service-discovery-load-balancing-poc/README.md)
- [service-mesh-control-plane-poc](service-mesh-control-plane-poc/README.md)
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
- [appointment-scheduling-reminder-poc](appointment-scheduling-reminder-poc/README.md)
- [local-delivery-service-poc](local-delivery-service-poc/README.md)
- [online-auction-poc](online-auction-poc/README.md)
- [online-shopping-poc](online-shopping-poc/README.md)
- [payment-system-poc](payment-system-poc/README.md)
- [personal-cash-flow-forecast-poc](personal-cash-flow-forecast-poc/README.md)
- [point-of-sale-poc](point-of-sale-poc/README.md)
- [price-tracker-poc](price-tracker-poc/README.md)
- [restaurant-booking-system-poc](restaurant-booking-system-poc/README.md)
- [returns-refunds-tracker-poc](returns-refunds-tracker-poc/README.md)
- [shared-expense-splitting-poc](shared-expense-splitting-poc/README.md)
- [subscription-billing-reminder-poc](subscription-billing-reminder-poc/README.md)
- [ticketmaster-poc](ticketmaster-poc/README.md)
- [uber-poc](uber-poc/README.md)
- [yelp-poc](yelp-poc/README.md)

### Consumer Product Simulations

- [facebook-news-feed-poc](facebook-news-feed-poc/README.md)
- [family-safety-checkin-poc](family-safety-checkin-poc/README.md)
- [family-school-activity-coordinator-poc](family-school-activity-coordinator-poc/README.md)
- [bar-menu-poc](bar-menu-poc/README.md)
- [flight-tracking-poc](flight-tracking-poc/README.md)
- [home-air-quality-monitor-poc](home-air-quality-monitor-poc/README.md)
- [household-laundry-coordinator-poc](household-laundry-coordinator-poc/README.md)
- [home-maintenance-reminder-poc](home-maintenance-reminder-poc/README.md)
- [home-warranty-receipt-vault-poc](home-warranty-receipt-vault-poc/README.md)
- [household-mail-triage-poc](household-mail-triage-poc/README.md)
- [household-waste-pickup-coordinator-poc](household-waste-pickup-coordinator-poc/README.md)
- [home-network-health-monitor-poc](home-network-health-monitor-poc/README.md)
- [home-plant-care-monitor-poc](home-plant-care-monitor-poc/README.md)
- [home-utility-usage-monitor-poc](home-utility-usage-monitor-poc/README.md)
- [household-chore-coordinator-poc](household-chore-coordinator-poc/README.md)
- [leetcode-poc](leetcode-poc/README.md)
- [medium-poc](medium-poc/README.md)
- [medication-refill-adherence-poc](medication-refill-adherence-poc/README.md)
- [netflix-poc](netflix-poc/README.md)
- [news-feed-system-poc](news-feed-system-poc/README.md)
- [package-delivery-tracker-poc](package-delivery-tracker-poc/README.md)
- [parking-meter-poc](parking-meter-poc/README.md)
- [personal-document-renewal-vault-poc](personal-document-renewal-vault-poc/README.md)
- [personal-errand-route-planner-poc](personal-errand-route-planner-poc/README.md)
- [personal-travel-itinerary-poc](personal-travel-itinerary-poc/README.md)
- [personal-sleep-recovery-tracker-poc](personal-sleep-recovery-tracker-poc/README.md)
- [pet-care-coordination-poc](pet-care-coordination-poc/README.md)
- [smart-home-automation-rules-poc](smart-home-automation-rules-poc/README.md)
- [smart-pantry-inventory-poc](smart-pantry-inventory-poc/README.md)
- [strava-poc](strava-poc/README.md)
- [tinder-poc](tinder-poc/README.md)
- [url-shortner-poc](url-shortner-poc/README.md)
- [vehicle-maintenance-fuel-tracker-poc](vehicle-maintenance-fuel-tracker-poc/README.md)
- [workout-tracker-poc](workout-tracker-poc/README.md)
- [youTube-top-K-poc](youTube-top-K-poc/README.md)

## How To Read A Project Folder

For the strongest review signal, open files in this order:

1. `README.md` for the fast explanation and demo flow
2. `TECHNICAL_README.md` or `TECHNICAL_DOC.md` for architecture and tradeoffs
3. `IMPROVEMENTS.md` for the path from POC to production

## Current Standard

The repository direction is to make every project easy to scan in under two minutes and deep enough to discuss in an interview or portfolio review.

- `119/119` POCs have a `README.md`
- `119/119` POCs have a technical companion doc
- `110/119` POCs have an `IMPROVEMENTS.md`

Use [POC_STANDARDS.md](POC_STANDARDS.md) as the baseline for future additions and cleanup.
