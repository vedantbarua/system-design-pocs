# LLM Prompt Router Technical README

## Problem Statement

LLM applications often start as one endpoint that forwards every prompt to one model. That is simple, but it hides important production concerns: some prompts need cheap fast handling, some need a larger reasoning profile, some should be blocked, and some exceed the budget for a safe call.

This POC demonstrates a small routing layer that makes those decisions explicit.

## Architecture Overview

The service is a single Python process with four main components:

- `PromptClassifier`: scores the prompt against configured route keywords and heuristics.
- `Guardrail`: blocks prompt-injection patterns and oversized global inputs.
- `BudgetManager`: enforces route-specific prompt limits and exposes estimated token usage.
- `PromptRouter`: coordinates classification, cache lookup, provider execution, fallback, metrics, and events.

Routes live in `data/routes.json`, so the routing table is visible and easy to change without editing the core pipeline.

## Core Data Model

- `RouteConfig`: route name, description, keywords, model profile, prompt limit, output limit, temperature, and system prompt.
- `RouteDecision`: selected route, score, confidence, matched keywords, and reason.
- `BudgetResult`: prompt size, estimated prompt tokens, route limit, output limit, and allow/block state.
- `RouterMetrics`: request totals, cache hits, guardrail blocks, budget blocks, provider failures, fallback count, latency, and per-route counts.
- `RouterEvent`: recent operational events for route completion, cache hits, guardrail blocks, budget blocks, and provider fallback.

## Request Flow

1. The caller submits a prompt through CLI or `POST /route`.
2. The guardrail checks for injection patterns, empty input, and the global prompt limit.
3. The classifier chooses a route, unless the caller provided an explicit route override.
4. The budget manager checks the selected route's prompt-size limit.
5. The router checks the in-memory cache using prompt, route, and provider as the cache key.
6. The selected provider runs. In mock mode this is deterministic local logic.
7. If provider mode is enabled and the provider fails, the router falls back to the mock client and records the failure.
8. The response includes the route decision, model profile, provider, budget details, cache state, and latency.

## Key Tradeoffs

- Keyword routing is transparent and testable, but it is less flexible than embedding or model-based routing.
- Route budgets are character based with rough token estimates. This keeps the POC dependency-free but is not as precise as provider-specific tokenization.
- In-memory cache and metrics are simple to inspect, but they reset when the process restarts.
- Mock fallback keeps demos reliable, but production systems may prefer fail-closed behavior for sensitive workflows.

## Failure Handling

- Prompt-injection and empty input are blocked before classification.
- Route budget overflow returns a structured budget block and does not call a provider.
- Unknown explicit route names fall back to `answer` with a low-confidence decision.
- Provider errors increment failure metrics, create a fallback event, and use the deterministic mock provider.
- Malformed JSON requests return `400`.

## Scaling Path

- Move route configuration into a managed config store with versioning and staged rollout.
- Replace keyword routing with an embedding classifier or a small dedicated router model.
- Use provider-specific tokenizers for precise budget control.
- Persist cache, metrics, and events in shared infrastructure.
- Add tenant-level policy, authorization, and per-route rate limits.
- Split provider calls into worker queues when routing latency becomes variable.

## What Is Intentionally Simplified

- No authentication, tenancy, or PII policy engine.
- No streaming provider responses.
- No persistent trace store.
- No learned classifier or online evaluation loop.
- No retry policy beyond deterministic fallback.
