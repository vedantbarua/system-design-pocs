# Python Ollama Improvements

## Production Gaps

- Replace the demo HTTP server with FastAPI, Starlette, or another production server.
- Move JSONL traces into durable queryable storage for prompts, citations, and evaluation results.
- Add a prompt registry with versions, owners, and rollback controls.
- Add model readiness checks that verify configured chat and embedding models are installed.
- Add structured response schemas for supported answer types.

## Reliability Improvements

- Add circuit breakers around the local Ollama server.
- Add request-level timeout budgets for retrieval, model inference, and response shaping.
- Add startup warmup for commonly used models.
- Add queueing or backpressure when local inference is saturated.
- Add graceful degradation modes that distinguish no model, slow model, and low-confidence answer cases.

## Scaling Improvements

- Move retrieval data from the JSON vector index into a dedicated vector database.
- Add chunk ingestion and incremental re-indexing.
- Cache prompts and responses in Redis or SQLite with prompt/model version keys.
- Support multiple Ollama hosts and route by model availability.
- Add browser-native server-sent events or WebSockets on top of the NDJSON streaming endpoint.

## Security Improvements

- Add source-level authorization before retrieved context enters the prompt.
- Redact sensitive fields from logs, traces, and fallback errors.
- Add context-injection scanning for retrieved documents.
- Add output filtering for secrets and unsafe content.
- Add per-user audit trails for blocked prompts and model calls.

## Testing Improvements

- Add more HTTP endpoint tests with mocked Ollama responses.
- Add golden-answer fixtures with expected citations.
- Add live provider-contract tests for `/api/chat`, `/api/embed`, `/api/tags`, and `/api/version`.
- Add latency and timeout tests around fallback behavior.
- Add fuzz tests for malformed JSON, injection phrases, and oversized prompts.
