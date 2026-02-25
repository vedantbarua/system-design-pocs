# FlashConf Technical Notes

## Core Flow

1. **Admin change** via `/admin/flags` updates the central store.
2. The change is written to the **audit trail**.
3. The **Caffeine ruleset cache** is invalidated.
4. **SSE** pushes a fresh ruleset snapshot to every connected client.

## Targeting Engine

- Each flag has **rules** with conditions (`attribute`, `operator`, `values`).
- Rules are evaluated in order; the **first match wins**.
- Supported operators: `EQUALS`, `NOT_EQUALS`, `IN`, `NOT_IN`, `CONTAINS`.
- Rollout support: a rule can set `rolloutPercent` (0-100) and `rolloutAttribute`.

## Caching Strategy

- The SDK endpoint uses a **local in-memory cache** (Caffeine) keyed by client + attributes.
- Cache entries expire after `flashconf.cache.ttl-seconds`.
- Any admin mutation invalidates the cache to keep clients consistent.

## SSE Push Model

- `/sdk/stream` registers clients with their attributes.
- Any admin change broadcasts a fresh ruleset for each registered client.
- The client uses `EventSource` to update local state instantly.

## Example Flag

```json
{
  "key": "new-checkout-flow",
  "description": "Checkout redesign",
  "enabled": false,
  "rules": [
    {
      "id": "rollout-30",
      "enabled": true,
      "conditions": [
        { "attribute": "country", "operator": "IN", "values": ["US", "CA"] }
      ],
      "rolloutPercent": 30,
      "rolloutAttribute": "userId"
    }
  ]
}
```
