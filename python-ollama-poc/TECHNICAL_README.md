# Python Ollama Technical README

## Problem Statement

Directly calling a local model from product code is simple, but it hides important operational concerns. A useful Python Ollama integration needs a clear boundary for model configuration, health checks, prompt assembly, timeouts, fallback behavior, citations, and request telemetry.

## Architecture Overview

The POC has five main pieces:

- `PythonOllamaPoc`: orchestration boundary for CLI and HTTP requests.
- `OllamaClient`: small standard-library HTTP client for `/api/chat`, `/api/embed`, `/api/version`, and `/api/tags`.
- `SimpleRetriever`: local lexical retriever over JSON documents.
- `Guardrail`: pre-model prompt-injection and size checks.
- `MockLocalModel`: deterministic fallback used when Ollama is unavailable.

State is held in `PocState`, which contains documents, cache entries, recent events, and metrics.

## Core Data Model

- `KnowledgeDocument`: id, title, source, tags, and body text.
- `RetrievalHit`: citation returned to clients with score and snippet.
- `GuardrailResult`: typed allow/block decision.
- `PocMetrics`: request, cache, guardrail, Ollama, fallback, and latency counters.
- `PocEvent`: bounded in-memory operational event.

## Request Flow

1. Client submits a prompt through CLI or `POST /ask`.
2. The app increments request metrics.
3. Guardrail checks reject obvious prompt-injection attempts and oversized prompts.
4. Cache lookup uses normalized prompt text and `top_k`.
5. Retriever selects local documents and builds bounded context.
6. `OllamaClient` sends the prompt and context to `POST /api/chat` with `stream: false`.
7. Ollama metadata and citations are returned with the answer.
8. If Ollama fails and fallback is enabled, the deterministic local model answers from the same citations.

## Key Tradeoffs

- Direct HTTP keeps dependencies low, but a production service may prefer the official Python library for ergonomics.
- Synchronous request handling is easy to inspect, but streaming responses would improve user experience for long generations.
- In-memory cache makes behavior visible without Redis, but it is not shared across processes.
- Lexical retrieval is deterministic, but semantic recall requires embeddings and a vector index.
- Mock fallback keeps demos runnable offline, but production systems should make degraded answer quality explicit to clients.

## Failure Handling

Ollama URL, timeout, HTTP, and malformed-response failures increment `ollama_failures` and emit an `ollama_failure` event. When `OLLAMA_ALLOW_MOCK_FALLBACK` is enabled, failures convert to deterministic mock responses and increment `mock_fallbacks`. When fallback is disabled, the response returns `reason: ollama_unavailable`.

Guardrail blocks are handled separately from provider failures because they represent policy decisions, not infrastructure errors.

## Scaling Path

- Replace lexical retrieval with embeddings generated through `/api/embed`.
- Store vectors in SQLite, Postgres with pgvector, or a dedicated vector index.
- Add streaming from Ollama to clients.
- Persist request traces, citations, and model metadata.
- Add model warmup and readiness checks per configured model.
- Use an ASGI server for higher concurrency.
- Add tenant quotas and request budgets.

## What Is Intentionally Simplified

- No external Python packages.
- No durable database or vector index.
- No authentication or authorization.
- No streaming responses.
- No background ingestion pipeline.
- No prompt registry or model rollout system.
