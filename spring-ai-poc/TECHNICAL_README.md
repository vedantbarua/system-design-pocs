# Spring AI POC Technical README

## Problem Statement

This POC demonstrates how to integrate Spring AI without letting model-specific code leak across the application. The useful system-design idea is a narrow AI boundary: the controller accepts a validated request, the service owns prompt construction and provider selection, and the rest of the app receives a predictable response shape.

The app is intentionally runnable in two modes:

- Demo mode, with no external secrets or model dependency.
- OpenAI mode, using Spring AI auto-configuration when `SPRING_AI_CHAT_MODEL=openai` and `OPENAI_API_KEY` are set.

## Architecture Overview

The application is a small Spring Boot MVC service with a Thymeleaf frontend.

- `AiController` serves the UI at `/` and exposes `POST /api/ai/ask`.
- `AiRequest` validates user input before it reaches the service.
- `AiAssistantService` owns prompt construction, model invocation, and deterministic fallback behavior.
- `AiResponse` returns a stable shape to both the browser UI and API callers.
- `application.properties` disables Spring AI model auto-configuration by default so the app starts locally without credentials.

The important dependency boundary is inside `AiAssistantService`. It receives an optional `ChatModel` through `ObjectProvider<ChatModel>`. If Spring AI provides a model bean, the service builds a `ChatClient`; otherwise, it returns a deterministic demo response.

## Core Data Model

### Request

```json
{
  "prompt": "Design a tiny rate limiter POC and list tradeoffs.",
  "context": "Java 17, Spring Boot, in-memory local demo."
}
```

- `prompt` is required and limited to 2,000 characters.
- `context` is optional and limited to 2,000 characters.

### Response

```json
{
  "answer": "...",
  "nextActions": ["..."],
  "mode": "demo",
  "generatedAt": "2026-05-26T12:00:00Z"
}
```

- `answer` contains the assistant output.
- `nextActions` gives follow-up implementation steps.
- `mode` is either `demo` or `spring-ai-openai`.
- `generatedAt` records when the response was created.

## Request Flow

1. The browser posts JSON to `POST /api/ai/ask`.
2. Spring validation rejects blank prompts or oversized fields.
3. `AiController` passes the validated request to `AiAssistantService`.
4. The service trims the prompt and normalizes optional context.
5. If a `ChatModel` is available, the service builds a Spring AI `ChatClient` with a default system prompt and calls the provider.
6. If no `ChatModel` is available, the service returns a deterministic demo response.
7. The UI renders the answer, mode, timestamp, and next actions.

## Prompt And Provider Boundary

The service uses one fixed system prompt:

- Act as a concise senior engineer.
- Return practical implementation guidance.
- Call out clear tradeoffs.
- Keep output under 180 words.

The user message is templated with explicit `Context` and `Question` sections. This keeps prompt assembly in one place and avoids scattering provider-specific prompting across controllers or UI code.

## Configuration

The default configuration keeps model auto-configuration off:

```properties
spring.ai.model.chat=${SPRING_AI_CHAT_MODEL:none}
spring.ai.model.embedding=${SPRING_AI_EMBEDDING_MODEL:none}
spring.ai.model.image=${SPRING_AI_IMAGE_MODEL:none}
spring.ai.openai.api-key=${OPENAI_API_KEY:}
spring.ai.openai.chat.options.model=${OPENAI_MODEL:gpt-4o-mini}
spring.ai.openai.chat.options.temperature=0.3
```

To run with OpenAI through Spring AI:

```bash
export OPENAI_API_KEY=your-api-key
SPRING_AI_CHAT_MODEL=openai mvn spring-boot:run
```

The app runs on port `8106`.

## API Surface

- `GET /`: browser UI.
- `POST /api/ai/ask`: ask the assistant with `{ prompt, context }`.

Example:

```bash
curl -X POST http://localhost:8106/api/ai/ask \
  -H 'Content-Type: application/json' \
  -d '{
    "prompt": "Design a small feature flag POC and list tradeoffs.",
    "context": "Use Spring Boot and keep it in memory."
  }'
```

## Failure Handling

- Blank prompts fail validation before service execution.
- Oversized prompt and context fields fail validation at the request boundary.
- Missing model configuration does not fail startup; the app returns demo responses.
- Empty context is normalized to `No additional context provided.`
- The UI catches non-2xx responses and renders the error message.

The current implementation does not wrap provider exceptions. In production, model timeouts, rate limits, and provider errors should be translated into controlled API responses.

## Key Tradeoffs

- Demo fallback improves local usability but must be clearly visible through the `mode` field.
- A single service keeps the AI boundary understandable, but larger apps would likely separate prompt templates, provider adapters, and policy checks.
- The fixed prompt keeps behavior consistent, but prompt versions are not tracked.
- The API returns model text directly; there is no structured-output validation beyond the response wrapper.
- The app uses synchronous request/response flow, which is simple but can tie user latency directly to provider latency.

## Scaling Path

A production-grade AI gateway would add:

- Provider timeout, retry, and circuit-breaker policy.
- Request and response logging with sensitive data redaction.
- Prompt versioning and evaluation datasets.
- Token, latency, and cost metrics.
- Structured-output schemas for workflows that require machine-readable responses.
- Async job handling or streaming responses for longer generations.
- Multi-provider routing and fallback.
- Per-user rate limits and quota enforcement.

## What Is Intentionally Simplified

- No authentication or per-user quota.
- No streaming response support.
- No prompt registry or prompt version history.
- No token accounting or cost tracking.
- No provider retry, timeout, or fallback policy.
- No persistence of prompts, responses, or audit history.
- No moderation or sensitive-data filtering.
