# LLM Context Gateway POC

Python proof-of-concept for a small LLM gateway that performs retrieval, guardrail checks, prompt assembly, provider fallback, caching, and observability around model calls.

## Goal

Show the system-design pieces that usually sit around an LLM feature. The POC can run fully offline with a deterministic mock model, or use an OpenAI-compatible chat endpoint when configured.

## What It Covers

- Local retrieval over a small knowledge base
- Prompt-injection guardrail before model execution
- Context-window and top-k retrieval limits
- Provider adapter with mock fallback
- In-memory response cache
- Request metrics and recent event log
- CLI, HTTP API, and lightweight evaluation flow

## Quick Start

```bash
cd llm-context-gateway-poc
python3 app.py demo
```

Ask one question:

```bash
python3 app.py ask "How does the gateway keep answers grounded?"
```

Run lightweight checks:

```bash
python3 -m unittest discover -s tests
python3 app.py eval
```

## Demo Flows

1. Ask a grounded architecture question and inspect citations.
2. Ask the same question again and observe a cache hit.
3. Submit a prompt-injection style request and observe a typed block.
4. Run with provider mode enabled, then remove the key and observe mock fallback.

## JSON Endpoints

Start the HTTP server:

```bash
python3 app.py serve --port 8099
```

Ask a question:

```bash
curl -s http://127.0.0.1:8099/ask \
  -H "Content-Type: application/json" \
  -d '{"question":"What happens when the provider fails?","top_k":3}'
```

Other endpoints:

- `GET /health`
- `GET /documents`
- `GET /metrics`
- `GET /events`

## Configuration

The app defaults to local mock mode.

Optional provider mode:

```bash
export LLM_PROVIDER=openai
export OPENAI_API_KEY=...
export OPENAI_MODEL=gpt-4o-mini
python3 app.py ask "How should answers cite context?"
```

Useful environment variables:

- `LLM_PROVIDER`: `mock` or `openai`
- `OPENAI_API_KEY`: required for OpenAI provider mode
- `OPENAI_MODEL`: model name for provider mode
- `OPENAI_BASE_URL`: defaults to `https://api.openai.com/v1`
- `LLM_TIMEOUT_SECONDS`: provider timeout, defaults to `12`

## Notes And Limitations

- Retrieval is lexical term overlap, not vector search.
- The cache is process-local and disappears on restart.
- The guardrail is intentionally simple pattern matching.
- HTTP state is in memory and not shared across processes.
- The mock model is deterministic so the POC is testable without network access.

## Technologies Used

- Python 3 standard library
- `http.server` for the demo API
- `unittest` for verification
- Optional OpenAI-compatible HTTP chat endpoint via `urllib`
