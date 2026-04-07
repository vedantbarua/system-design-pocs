# Feature Flag / Config Service POC

Spring Boot proof-of-concept for a lightweight feature flag and dynamic config service with rule targeting, deterministic rollout percentages, local client cache sync, and versioned propagation.

## Goal

Demonstrate the control-plane mechanics behind practical runtime configuration without introducing external storage, Redis, or a real streaming bus.

## What It Covers

- Boolean flags and non-boolean config entries
- Ordered targeting rules with exact-match attribute conditions
- Deterministic rollout percentages using a stable subject key
- Versioned propagation log for incremental client sync
- Simulated local caches per client instance
- Dashboard for definitions, evaluations, client cache state, and recent changes

## Quick Start

1. Ensure Java 17+ and Maven are installed.
2. Run the app:
   ```bash
   cd feature-flag-config-poc
   mvn org.springframework.boot:spring-boot-maven-plugin:run
   ```
3. Open `http://localhost:8134`.

## UI Flows

- Publish a flag or config with a JSON default value
- Add targeting rules using `name|key=value,key=value|rollout|jsonValue`
- Evaluate a key for a subject and request attributes
- Sync a client cache from a previous version to simulate propagation
- Delete a definition and observe cache invalidation on the next sync

## JSON Endpoints

- `GET /api/snapshot` inspect definitions, clients, and change history
- `GET /api/definitions` list published definitions
- `POST /api/definitions` create or update a definition
- `DELETE /api/definitions/{key}` delete a definition
- `POST /api/evaluate` evaluate a key for a subject and attributes
- `POST /api/clients/{clientId}/sync` sync a client cache from a known version

Example definition request:

```json
{
  "key": "checkout.redesign",
  "type": "FLAG",
  "defaultValue": false,
  "description": "new checkout flow",
  "owner": "growth",
  "rules": [
    {
      "name": "premium-us",
      "conditions": {
        "plan": "premium",
        "region": "us"
      },
      "rolloutPercentage": 25,
      "value": true
    }
  ]
}
```

Example evaluation request:

```json
{
  "key": "checkout.redesign",
  "subjectKey": "user-123",
  "attributes": {
    "plan": "premium",
    "region": "us"
  }
}
```

Example client sync request:

```json
{
  "lastKnownVersion": 2
}
```

## Configuration

- `server.port` defaults to `8134`
- `spring.thymeleaf.cache=false` keeps the dashboard editable during development
- change-history retention is bounded in memory for the UI snapshot view

## Notes and Limitations

- Storage is fully in memory and resets on restart.
- Rule matching is exact-key equality only in this POC.
- Client sync models polling-based propagation rather than push or streaming.

## Technologies Used

- Spring Boot 3.2
- Thymeleaf
- Java 17
- In-memory versioned definition store
