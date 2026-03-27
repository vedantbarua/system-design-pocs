# Technical README: Feature Flag / Config Service POC

This document explains the architecture, flow, and file-by-file purpose of the feature flag and config service proof-of-concept.

## Architecture Overview

- **Framework**: Spring Boot 3.2 with MVC and Thymeleaf for a server-rendered control plane.
- **Storage**: Definitions, client cache state, and propagation history are stored in in-memory `LinkedHashMap` and `Deque` collections.
- **Evaluation**: Each definition has an ordered rule list; rules match exact attribute equality and may optionally apply a rollout percentage.
- **Rollout**: Percentage rollout is deterministic per subject because the service hashes `definitionKey + ruleId + subjectKey` into a stable 0-99 bucket.
- **Propagation**: Every mutation increments a global version and appends a change event so clients can sync incrementally.
- **Local cache model**: Each client maintains a simulated local cache of definition snapshots, allowing the UI to demonstrate cache warmup, incremental updates, and invalidation after deletes.

## File Structure

```text
feature-flag-config-poc/
├── pom.xml
├── README.md
├── TECHNICAL_README.md
└── src
    ├── main
    │   ├── java/com/randomproject/featureflag
    │   │   ├── FeatureFlagConfigPocApplication.java
    │   │   ├── FeatureFlagController.java
    │   │   ├── FeatureFlagService.java
    │   │   └── FeatureFlagModels.java
    │   └── resources
    │       ├── application.properties
    │       └── templates/index.html
    └── test
        └── java/com/randomproject/featureflag/FeatureFlagServiceTest.java
```

## Flow

1. **Publish definition**: `POST /definitions` or `POST /api/definitions` validates the key, default JSON value, and rules, then stores the definition at a new global version.
2. **Evaluate request**: `POST /evaluate` or `POST /api/evaluate` loads the definition, scans rules in order, checks exact-match conditions, applies rollout gating if present, and returns either the matched rule value or the default value.
3. **Track propagation**: Every upsert or delete writes a change event into the recent propagation log so later client syncs can request only the delta since a version.
4. **Sync client cache**: `POST /clients/sync` or `POST /api/clients/{clientId}/sync` returns either a full snapshot or an incremental set of upserts/removals, then updates the simulated client-local cache.
5. **Delete definition**: `POST /definitions/delete` or `DELETE /api/definitions/{key}` removes the definition, advances the version, and causes the next client sync to invalidate that key.

## Notable Implementation Details

- **Ordered targeting rules**: Rules are evaluated in insertion order, so the first matching rule wins.
- **Exact-match conditions**: This POC supports simple `key=value` targeting only; there is no regex, range, or segment language.
- **Deterministic rollout**: CRC32 provides a lightweight stable bucket function suitable for a single-process POC.
- **Version-based sync**: Clients request updates relative to a `lastKnownVersion`; if the requested version falls behind the retained change log, the service falls back to a full snapshot.
- **Definition cache semantics**: Client caches store definition snapshots rather than per-request resolved values, which better reflects how SDK-style local evaluation usually works.
- **Bounded observability**: Recent change history is capped to keep the in-memory event log and dashboard manageable.

## Configuration

- `server.port=8134`
- `spring.thymeleaf.cache=false`

## Build / Run

- `mvn org.springframework.boot:spring-boot-maven-plugin:run`
- `mvn test`
