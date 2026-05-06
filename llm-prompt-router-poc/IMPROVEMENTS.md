# LLM Prompt Router Improvements

## Production Gaps

- Add authentication and per-tenant route policies before exposing the API outside localhost.
- Store route config with version history, ownership, and rollback support.
- Add request tracing with prompt hashes, route versions, provider latency, and fallback reason.
- Support explicit fail-open and fail-closed policies per route.

## Reliability Improvements

- Add provider retries with jittered backoff for transient failures.
- Add circuit breakers per provider and model profile.
- Persist events and metrics outside process memory.
- Add health checks that verify configured provider credentials and model availability.

## Scaling Improvements

- Replace keyword scoring with embedding-based or model-based routing.
- Add a distributed cache keyed by route, prompt hash, model, and route-config version.
- Use async workers or a queue for slow reasoning routes.
- Track route-level latency percentiles and use them for adaptive routing.

## Security Improvements

- Add tenant-aware prompt and response redaction.
- Extend guardrails with allowlists, policy checks, and output validation.
- Block sensitive route overrides unless the caller has permission.
- Store only hashes or redacted payloads in traces by default.

## Testing Improvements

- Add contract tests for the OpenAI-compatible provider adapter.
- Add regression fixtures for route classification edge cases.
- Add HTTP endpoint tests with a local test server.
- Add load tests that verify cache hit behavior and route counters under concurrency.
