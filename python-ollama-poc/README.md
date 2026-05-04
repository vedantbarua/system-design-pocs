# Python Ollama POC

Python proof-of-concept for a local LLM gateway that calls Ollama for chat, exposes health/model discovery, performs small RAG-style prompt assembly, and falls back to a deterministic mock when Ollama is unavailable.

## Goal

Show how a Python service can wrap local Ollama inference with the control-plane pieces a real application needs: model configuration, bounded context, prompt safety checks, timeout handling, fallback behavior, metrics, and a JSON API.

## What It Covers

- Python standard-library client for Ollama `POST /api/chat`
- Ollama health check through `/api/version`
- Local model discovery through `/api/tags`
- Embedding hook through `POST /api/embed`
- RAG-style retrieval over a small local knowledge base
- Prompt-injection guardrail before model execution
- In-memory response cache, recent events, and request metrics
- CLI, HTTP API, deterministic fallback, and smoke evaluation

## Quick Start

Run without a local model:

```bash
cd python-ollama-poc
python3 app.py demo
```

Run checks:

```bash
python3 -m unittest discover -s tests
python3 app.py eval
```

Use local Ollama:

```bash
ollama pull llama3.2
python3 app.py ask "How should a Python service call Ollama safely?"
```

## Demo Flows

1. Ask how the Python service should call Ollama and inspect citations.
2. Stop Ollama or point `OLLAMA_BASE_URL` to a bad port and observe mock fallback.
3. Ask the same prompt twice and observe a cache hit.
4. Submit a prompt-injection style request and observe a typed guardrail block.
5. Run `models` or `health` to inspect local Ollama reachability.

## JSON Endpoints

Start the HTTP server:

```bash
python3 app.py serve --port 8110
```

Ask a question:

```bash
curl -s http://127.0.0.1:8110/ask \
  -H "Content-Type: application/json" \
  -d '{"prompt":"How should grounded answers cite local context?","top_k":3}'
```

Other endpoints:

- `GET /health`
- `GET /models`
- `GET /documents`
- `GET /metrics`
- `GET /events`

## Configuration

The app defaults to `http://127.0.0.1:11434` and `llama3.2`.

Useful environment variables:

- `OLLAMA_BASE_URL`: Ollama server URL
- `OLLAMA_CHAT_MODEL`: chat model, defaults to `llama3.2`
- `OLLAMA_EMBED_MODEL`: embedding model, defaults to `embeddinggemma`
- `OLLAMA_TIMEOUT_SECONDS`: HTTP timeout, defaults to `20`
- `OLLAMA_KEEP_ALIVE`: model keep-alive duration, defaults to `5m`
- `OLLAMA_ALLOW_MOCK_FALLBACK`: set to `false` to fail closed when Ollama is unavailable

## Implementation Plan

1. Keep the first version dependency-free so the control-plane behavior is easy to review and test.
2. Use direct Ollama HTTP calls for chat, health, model listing, and embedding experiments.
3. Keep retrieval lexical in the first pass, then replace it with Ollama embeddings plus a vector index.
4. Make fallback explicit in metrics so local demo availability does not hide provider failures.
5. Add streaming and persisted traces after the synchronous JSON path is stable.

## Notes And Limitations

- The fallback response is deterministic and does not represent real model quality.
- Retrieval is lexical scoring, not semantic vector search.
- Cache, events, and metrics are process-local.
- The HTTP server is for demonstration, not production traffic.
- There is no authentication, tenant isolation, or source-level authorization.

## Technologies Used

- Python 3 standard library
- Ollama local HTTP API
- `http.server` for the JSON API
- `unittest` for verification
