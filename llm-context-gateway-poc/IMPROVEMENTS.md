# LLM Context Gateway Improvements

## Production Gaps

- Replace lexical retrieval with hybrid vector plus keyword search.
- Add a prompt registry with explicit prompt versions and rollout controls.
- Store request traces, retrieved chunks, provider response ids, and answer artifacts durably.
- Add streaming responses for long answers.
- Add authentication, tenant isolation, and per-route authorization.

## Reliability Improvements

- Add provider circuit breakers with cooldown windows.
- Add secondary provider routing instead of only mock fallback.
- Persist cache and event data outside the process.
- Add idempotency keys for client retries.
- Add structured timeout budgets for retrieval, provider calls, and response shaping.

## Scaling Improvements

- Move document indexing to a background ingestion pipeline.
- Shard retrieval indexes by tenant or domain.
- Add Redis or another shared cache for multi-instance deployment.
- Use async IO or a production ASGI server for high-concurrency traffic.
- Add queue-backed evaluation jobs for sampled responses.

## Security Improvements

- Scan retrieved context for prompt-injection content before prompt assembly.
- Add output moderation and sensitive-data filters.
- Enforce source-level authorization during retrieval.
- Redact secrets from logs and provider error messages.
- Add audit export for blocked requests and policy changes.

## Testing Improvements

- Add golden-answer evaluation fixtures with expected citations.
- Add provider-contract tests using mocked HTTP responses.
- Add latency budget tests for retrieval and prompt assembly.
- Add fuzz tests for injection patterns and malformed JSON bodies.
- Add end-to-end tests for HTTP endpoints and provider fallback behavior.
