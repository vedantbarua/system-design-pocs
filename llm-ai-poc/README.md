# LLM AI POC

Python proof-of-concept for a small LLM-style AI agent runtime with planning, tool use, memory, guardrails, budgets, and observability.

## Goal

Show the control-plane mechanics behind an AI assistant without requiring an external model provider. The "LLM" components are deterministic mocks so the workflow is easy to test, then swap for a real provider later.

## What It Covers

- Intent classification for research, planning, analysis, and calculation goals
- Deterministic planner that emits typed tool calls
- Tool registry for retrieval, arithmetic, planning, and summarization
- Local RAG-style knowledge search with citations
- Short-term memory retrieval across related runs
- Prompt-injection and prompt-budget guardrails
- Tool-step budget enforcement
- Event log, metrics, CLI, HTTP API, and smoke evaluation

## Quick Start

```bash
cd llm-ai-poc
python3 app.py demo
```

Ask one goal:

```bash
python3 app.py ask "Plan an AI support assistant rollout with guardrails and evaluation"
```

Run checks:

```bash
python3 -m unittest discover -s tests
python3 app.py eval
```

## Demo Flows

1. Ask for an AI rollout plan and inspect retrieval citations plus planned steps.
2. Ask a cost question and confirm the calculator tool handles arithmetic.
3. Submit a prompt-injection request and observe a typed guardrail block.
4. Ask a related follow-up and observe memory being retrieved.
5. Run with `--max-steps 1` to see budget-limited execution.

## JSON Endpoints

Start the HTTP server:

```bash
python3 app.py serve --port 8101
```

Run the agent:

```bash
curl -s http://127.0.0.1:8101/agent \
  -H "Content-Type: application/json" \
  -d '{"goal":"Calculate 120000 * 0.0025 for the monthly request budget","max_steps":5}'
```

Other endpoints:

- `GET /health`
- `GET /knowledge`
- `GET /metrics`
- `GET /events`
- `GET /memory`

## Configuration

This POC has no required environment variables. Runtime knobs are passed as CLI flags or JSON fields:

- `--max-steps`: maximum tool calls for `ask`
- `max_steps`: maximum tool calls for `POST /agent`
- `--host` and `--port`: HTTP bind settings for `serve`

## Notes And Limitations

- The planner and answer composer are deterministic local mocks, not a hosted LLM.
- Retrieval is lexical scoring, not embeddings or vector search.
- Memory and metrics are process-local and reset when the process exits.
- Guardrails are simple pattern and length checks.
- Tool calls do not perform external side effects.

## Technologies Used

- Python 3 standard library
- `http.server` for the JSON API
- `unittest` for verification
- JSON file-backed demo knowledge base
