# Spring AI POC

A small Spring Boot proof of concept that shows how to put Spring AI behind a narrow application service.

## Features

- One-page UI for asking an assistant a short engineering question
- `POST /api/ai/ask` JSON endpoint
- Spring AI `ChatClient` integration when a chat model is configured
- Deterministic demo fallback when no API key/model is configured
- Input validation and a focused MVC test

## Quick Start

1. Ensure Java 17+ and Maven are installed.
2. Navigate to the project directory: `cd spring-ai-poc`
3. Run in demo mode: `mvn spring-boot:run`
4. Open `http://localhost:8106`

## Use OpenAI Through Spring AI

```bash
export OPENAI_API_KEY=your-api-key
SPRING_AI_CHAT_MODEL=openai mvn spring-boot:run
```

Optional model override:

```bash
OPENAI_MODEL=gpt-4o-mini SPRING_AI_CHAT_MODEL=openai mvn spring-boot:run
```

## API Example

```bash
curl -X POST http://localhost:8106/api/ai/ask \
  -H 'Content-Type: application/json' \
  -d '{
    "prompt": "Design a tiny rate limiter POC and list tradeoffs.",
    "context": "Java 17, Spring Boot, in-memory local demo."
  }'
```

## Technologies

- Spring Boot 3.5.13
- Spring AI 1.1.4
- Java 17
- Thymeleaf
- OpenAI starter: `spring-ai-starter-model-openai`

## Notes

The default `spring.ai.model.chat=none` keeps the app runnable without secrets. Set `SPRING_AI_CHAT_MODEL=openai` and `OPENAI_API_KEY` to let Spring AI auto-configure the OpenAI chat model.
