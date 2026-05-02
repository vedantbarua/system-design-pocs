# LLM AI POC Improvements

## Production Gaps

- Replace deterministic mocks with provider adapters behind the same planner and answerer interfaces.
- Add JSON-schema validation for each tool's arguments and result shape.
- Persist runs, tool calls, memory, and evaluations in a database.
- Add prompt and tool versioning so responses can be traced to exact runtime configuration.
- Add a small UI that shows the plan, tool timeline, citations, and budget stops.

## Reliability Improvements

- Add request timeouts and retries for external model and retrieval providers.
- Make tool execution idempotent before adding side-effecting tools.
- Add circuit breakers around failing providers and tools.
- Persist the event log so traces survive process restarts.
- Add structured error categories for provider, retrieval, guardrail, and tool failures.

## Scaling Improvements

- Move retrieval to hybrid lexical/vector search with shardable indexes.
- Run independent read-only tools concurrently with a global budget.
- Cache repeated retrieval and answer paths with prompt/tool-version keys.
- Add tenant quotas for tokens, tool steps, and requests per minute.
- Split routing, planning, tool execution, and answer composition into separate services when traffic requires it.

## Security Improvements

- Add authentication and tenant authorization to HTTP endpoints.
- Validate all tool inputs with allowlisted schemas.
- Add output guardrails for data leakage, missing citations, and unsafe recommendations.
- Store secrets in a managed secret system before adding provider keys.
- Add audit trails for every user-visible answer and side-effecting action.

## Testing Improvements

- Expand `app.py eval` into a versioned evaluation dataset.
- Add tests for all HTTP endpoints and error responses.
- Add golden traces for representative planning and tool-call flows.
- Add fuzz tests for calculator expression parsing and guardrail bypass attempts.
- Add latency and budget regression tests for larger knowledge bases.
