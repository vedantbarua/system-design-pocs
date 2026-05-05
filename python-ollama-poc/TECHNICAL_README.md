# Python Ollama Technical README

## Problem Statement

Directly calling a local model from product code is simple, but it hides important operational concerns. A useful Python Ollama integration needs a clear boundary for model configuration, health checks, prompt assembly, timeouts, fallback behavior, citations, and request telemetry.

## Architecture Overview

The POC has eight main pieces:

- `PythonOllamaPoc`: orchestration boundary for CLI and HTTP requests.
- `OllamaClient`: small standard-library HTTP client for `/api/chat`, streaming chat, `/api/embed`, `/api/version`, and `/api/tags`.
- `SimpleRetriever`: local lexical retriever over JSON documents.
- `VectorIndex`: persisted vector index for retrieved documents.
- `HybridRetriever`: combines lexical and vector scores.
- `Guardrail`: pre-model prompt-injection and size checks.
- `TraceStore`: JSONL request trace writer and reader.
- `MockLocalModel`: deterministic fallback used when Ollama is unavailable.

State is held in `PocState`, which contains documents, cache entries, recent events, and metrics. Runtime artifacts are stored under `runtime/` by default.

## Core Data Model

- `KnowledgeDocument`: id, title, source, tags, and body text.
- `RetrievalHit`: citation returned to clients with score and snippet.
- `GuardrailResult`: typed allow/block decision.
- `PocMetrics`: request, cache, guardrail, Ollama, fallback, and latency counters.
- `PocEvent`: bounded in-memory operational event.
- `VectorIndex`: persisted document embeddings keyed by document id.
- `TraceStore`: JSONL records with prompt hash, provider, retrieval mode, citations, and latency.

## Request Flow

1. Client submits a prompt through CLI or `POST /ask`.
2. The app increments request metrics.
3. Guardrail checks reject obvious prompt-injection attempts and oversized prompts.
4. Cache lookup uses normalized prompt text, `top_k`, and retrieval mode.
5. Retriever selects local documents through lexical, vector, or hybrid scoring.
6. The app builds bounded context from selected citations.
7. `OllamaClient` sends the prompt and context to `POST /api/chat` with `stream: false`.
8. Ollama metadata and citations are returned with the answer.
9. If Ollama fails and fallback is enabled, the deterministic local model answers from the same citations.
10. A JSONL trace records the provider route, citations, mode, and latency.

## Streaming Flow

1. Client submits a prompt through CLI `stream` or `POST /ask-stream`.
2. The app emits a metadata event containing provider intent, retrieval mode, and citations.
3. Ollama streaming chunks are converted to newline-delimited JSON token events.
4. If streaming fails before completion and fallback is enabled, one deterministic token event is emitted.
5. A final `done` event includes the accumulated answer, provider metadata, citations, and latency.

## Key Tradeoffs

- Direct HTTP keeps dependencies low, but a production service may prefer the official Python library for ergonomics.
- NDJSON streaming is easy to inspect with curl, but a browser UI would usually translate it into server-sent events or WebSockets.
- In-memory cache makes behavior visible without Redis, but it is not shared across processes.
- Deterministic hash embeddings keep tests offline, but semantic recall requires real Ollama embeddings.
- Mock fallback keeps demos runnable offline, but production systems should make degraded answer quality explicit to clients.

## Failure Handling

Ollama URL, timeout, HTTP, and malformed-response failures increment `ollama_failures` and emit an `ollama_failure` event. When `OLLAMA_ALLOW_MOCK_FALLBACK` is enabled, failures convert to deterministic mock responses and increment `mock_fallbacks`. When fallback is disabled, the response returns `reason: ollama_unavailable`.

Guardrail blocks are handled separately from provider failures because they represent policy decisions, not infrastructure errors.

Embedding failures during index rebuild fall back to deterministic local embeddings. That keeps the index command runnable without a local embedding model while making the source visible in status output.

## Scaling Path

- Move the JSON vector index into SQLite, Postgres with pgvector, or a dedicated vector index.
- Persist metrics and cache entries outside the process.
- Add model warmup and readiness checks per configured model.
- Use an ASGI server for higher concurrency.
- Add tenant quotas and request budgets.

## What Is Intentionally Simplified

- No external Python packages.
- No durable database or vector index.
- No authentication or authorization.
- No browser UI for streaming responses.
- No background ingestion pipeline.
- No prompt registry or model rollout system.
