# LLM AI POC Technical README

## Problem Statement

Most AI demos show a single prompt and response. Production LLM features need more structure: request validation, planning, tool execution, memory, budgets, evaluation, and observability. This POC makes those surrounding mechanics explicit in a small Python runtime.

## Architecture Overview

The runtime is centered on `AgentRuntime.run(goal, max_steps)`.

1. `Guardrail` validates the user goal before any planning occurs.
2. `MemoryStore` retrieves related prior runs from process memory.
3. `MockPlannerLLM` classifies intent and creates a typed tool plan.
4. `ToolRegistry` executes allowed tools and returns typed results.
5. `MockAnswerLLM` composes a grounded answer from tool outputs.
6. `AgentState` records metrics, memory, and recent events.

The mock planner and answerer are intentionally deterministic. They represent the boundaries where a hosted LLM could later be attached while keeping this POC offline and testable.

## Core Data Model

- `KnowledgeItem`: local source document with id, title, tags, and body.
- `KnowledgeHit`: scored retrieval result with snippet and citation id.
- `PlanStep`: typed tool call containing a tool name, arguments, and reason.
- `ToolResult`: success or failure result with latency and output.
- `MemoryEntry`: compact prior goal, answer, and intent.
- `AgentEvent`: timestamped audit event for runs, plans, tools, and blocks.
- `AgentMetrics`: counters for runs, guardrail blocks, tool calls, failures, budget stops, and latency.

## Request Flow

For a normal request, the runtime:

1. Records `run_started`.
2. Blocks unsafe or oversized goals.
3. Retrieves related memory using lexical token overlap.
4. Classifies intent into `research`, `planning`, `analysis`, or `calculation`.
5. Builds a plan that usually starts with `search_knowledge`.
6. Adds `calculate`, `create_action_plan`, or `summarize_findings` steps when the goal and memory call for them.
7. Executes steps until the configured tool budget is reached.
8. Composes an answer with citations, calculations, plan output, memory, and budget notes.
9. Stores a compact memory entry and records `run_finished`.

## Key Tradeoffs

- Deterministic mock LLMs keep tests stable, but they cannot model real language variance.
- Lexical retrieval is transparent and dependency-free, but misses semantic matches.
- In-memory state keeps the POC small, but it is not durable or multi-process safe.
- A fixed tool registry is safer for a POC than dynamic plugin loading.
- The answer composer favors inspectability over natural prose.

## Failure Handling

- Guardrail failures return typed JSON with `blocked: true` and no tool execution.
- Unknown or invalid tool behavior is captured as a failed `ToolResult`.
- Calculator input is parsed through Python AST and only numeric arithmetic nodes are allowed.
- Tool-step budgets stop execution and increment `budget_stops`.
- HTTP errors are returned as JSON with explicit status codes.

## Scaling Path

To move this design toward production:

- Replace lexical search with embeddings plus hybrid ranking.
- Store memory, traces, and metrics in durable services.
- Add per-tool schemas and validation before execution.
- Add async tool execution for independent read-only tools.
- Route requests across cheaper and stronger model tiers.
- Add offline eval gates for prompts, retrieval settings, and model changes.
- Introduce tenant-level quotas, cost attribution, and rate limits.

## What Is Intentionally Simplified

- No external LLM provider is called.
- No vector database or embedding model is required.
- No authentication, authorization, or tenant isolation is implemented.
- No durable event log, queue, or database is used.
- No side-effecting tools are included.
- No UI is included because the JSON API and CLI expose the runtime behavior directly.
