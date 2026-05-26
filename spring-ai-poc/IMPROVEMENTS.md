# Improvements

## Production Gaps

- Add authentication and per-user authorization before exposing model-backed endpoints.
- Add provider timeout, retry, and fallback policies around Spring AI calls.
- Add prompt versioning so changes to system and user prompt templates can be audited and evaluated.
- Add structured-output support for use cases that require machine-readable responses.
- Add persistence for prompt requests, response metadata, and audit history where appropriate.

## Reliability Improvements

- Translate provider exceptions, timeouts, and rate-limit responses into controlled API errors.
- Add circuit-breaker behavior so provider outages do not exhaust server threads.
- Add request IDs and response metadata for tracing individual generations.
- Add safe degradation from provider mode to demo or fallback mode only when explicitly configured.
- Add streaming or async execution for slow generations to avoid long blocking HTTP requests.

## Scaling Improvements

- Add per-user and global rate limits for model calls.
- Track token usage, latency, error rate, and cost by model and route.
- Introduce a provider adapter layer if the app grows beyond one model provider.
- Add response caching for deterministic or repeated prompts when product behavior allows it.
- Move long-running generation workflows to a queue-backed job model.

## Security Improvements

- Redact secrets and sensitive user content from logs.
- Add input policy checks for prompt injection, unsafe content, and sensitive-data leakage.
- Add output policy checks before returning generated content to users.
- Keep API keys in a secrets manager instead of shell environment variables for deployed environments.
- Add abuse controls such as request quotas, payload limits, and alerting on unusual usage.

## Testing Improvements

- Add MVC tests for `POST /api/ai/ask`, validation failures, and response shape.
- Add service tests for context normalization and long prompt summarization behavior.
- Add mocked `ChatModel` tests for provider-mode prompt construction.
- Add contract tests for the frontend's expected API response fields.
- Add evaluation fixtures for prompt changes so output quality can be compared over time.
