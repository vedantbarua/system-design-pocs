# LLM Context Gateway Technical README

## Problem Statement

LLM features often start as direct calls from a product endpoint to a model provider. That becomes difficult to operate once teams need grounded context, safety checks, retries, cost limits, citations, and auditability. This POC models a gateway layer that centralizes those concerns.

## Architecture Overview

The application has four main pieces:

- `LLMGateway`: request orchestration boundary.
- `SimpleRetriever`: lexical retrieval over local documents.
- `Guardrail`: pre-model safety checks for obvious prompt-injection attempts.
- Provider clients: `MockLLMClient` for offline deterministic behavior and `OpenAIChatClient` for an OpenAI-compatible endpoint.

Request state is stored in a `GatewayState` object containing documents, response cache, metrics, and recent events.

## Core Data Model

- `KnowledgeDocument`: source document with id, title, tags, source, and body.
- `RetrievalHit`: scored retrieval result returned as a citation.
- `GuardrailResult`: typed allow/block decision.
- `GatewayMetrics`: counters for requests, cache hits, blocks, provider calls, failures, fallbacks, and latency.
- `GatewayEvent`: recent operational events for demo observability.

## Request Flow

1. Client submits a question through CLI or `POST /ask`.
2. Gateway increments request metrics and checks guardrails.
3. Gateway checks the normalized cache key.
4. Retriever scores documents and returns top-k hits.
5. Gateway builds bounded context from retrieved documents.
6. Provider adapter generates an answer.
7. Provider failures are logged and converted to deterministic mock fallback.
8. Response returns answer, provider, cache flag, latency, and citations.

## Key Tradeoffs

- Lexical retrieval keeps the POC dependency-free, but misses semantic matches.
- In-memory cache makes cache behavior visible without introducing Redis.
- Pattern-based guardrails are easy to inspect, but incomplete.
- The mock model makes local testing reliable, but does not represent full LLM behavior.
- Provider fallback favors demo availability over production-grade answer quality.

## Failure Handling

The gateway catches provider timeout, URL, auth/config, and malformed-response errors. Those failures increment metrics, emit a `provider_fallback` event, and return a mock response. Guardrail blocks are treated separately from failures because they are expected policy decisions.

The HTTP handler returns typed JSON for bad input instead of surfacing stack traces to clients.

## Scaling Path

Productionizing this design would usually add:

- Vector index or hybrid search service
- Persistent cache with prompt-version-aware keys
- Provider circuit breakers and multi-provider routing
- Async request handling for concurrent model calls
- Durable event stream for audit logs
- Evaluation pipeline tied to prompt and model versions
- Tenant-aware quotas and per-route budget controls

## What Is Intentionally Simplified

- No external Python dependencies
- No database or distributed cache
- No streaming responses
- No authentication or per-user authorization
- No embedding model
- No background jobs for document ingestion
- No real prompt/version registry
