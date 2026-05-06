# LLM Prompt Router POC

Basic Python proof-of-concept for routing LLM prompts to task-specific model profiles with guardrails, budget checks, fallback behavior, caching, metrics, and a small JSON API.

## Goal

Show the smallest useful control plane around an LLM feature: classify the prompt, choose a route, apply route-specific limits, call a provider or deterministic mock, and expose enough telemetry to understand what happened.

## What It Covers

- Intent classification across summarize, classify, extract, rewrite, and answer routes
- Route-specific model profiles, context budgets, output limits, and temperatures
- Prompt-injection guardrail before provider execution
- Optional OpenAI-compatible chat provider with deterministic mock fallback
- In-memory response cache, route counters, event log, and latency metrics
- CLI, HTTP API, and smoke evaluation

## Quick Start

```bash
cd llm-prompt-router-poc
python3 app.py demo
```

Route one prompt:

```bash
python3 app.py route "Summarize this release note into three crisp bullets."
```

Run checks:

```bash
python3 -m unittest discover -s tests
python3 app.py eval
```

## Demo Flows

1. Ask for a summary and confirm the prompt goes to the `summarize` route.
2. Ask for support-ticket triage and inspect the `classify` response.
3. Extract action items and risks from a short meeting note.
4. Submit a prompt-injection style request and observe a typed block.
5. Send the same prompt twice and observe a cache hit.
6. Force a route with `--route classify` and send a large prompt to see budget rejection.

## JSON Endpoints

Start the HTTP server:

```bash
python3 app.py serve --port 8115
```

Route a prompt:

```bash
curl -s http://127.0.0.1:8115/route \
  -H "Content-Type: application/json" \
  -d '{"prompt":"Extract actions and risks: Maya owns rollout by Friday. Risk: stale config."}'
```

Other endpoints:

- `GET /health`
- `GET /routes`
- `GET /metrics`
- `GET /events`
- `POST /route`

## Configuration

The app defaults to local mock mode and has no required environment variables.

Optional OpenAI-compatible provider mode:

```bash
export LLM_ROUTER_PROVIDER=openai-compatible
export LLM_ROUTER_API_KEY=...
export LLM_ROUTER_MODEL=gpt-4o-mini
python3 app.py route "Rewrite this update for an engineering manager."
```

Useful environment variables:

- `LLM_ROUTER_PROVIDER`: `mock` or `openai-compatible`
- `LLM_ROUTER_API_KEY`: API key for provider mode
- `LLM_ROUTER_BASE_URL`: defaults to `https://api.openai.com/v1`
- `LLM_ROUTER_MODEL`: defaults to `gpt-4o-mini`
- `LLM_ROUTER_TIMEOUT_SECONDS`: provider timeout, defaults to `12`

## Notes And Limitations

- The mock model is deterministic and useful for testing, not model quality.
- Classification is keyword and heuristic based, not learned routing.
- Cache, metrics, and events are process-local.
- The HTTP server is intentionally lightweight and does not include authentication.
- Route config is loaded from JSON at startup and is not hot-reloaded.

## Technologies Used

- Python 3 standard library
- `http.server` for the JSON API
- `unittest` for verification
- Optional OpenAI-compatible HTTP chat endpoint via `urllib`
