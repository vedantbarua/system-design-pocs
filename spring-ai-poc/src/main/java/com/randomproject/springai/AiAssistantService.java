package com.randomproject.springai;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

@Service
public class AiAssistantService {

    private static final String SYSTEM_PROMPT = """
            You are a concise senior engineer helping with small proof-of-concept designs.
            Return practical implementation guidance with clear tradeoffs.
            Keep the answer under 180 words.
            """;

    private final Optional<ChatClient> chatClient;

    public AiAssistantService(ObjectProvider<ChatModel> chatModelProvider) {
        ChatModel chatModel = chatModelProvider.getIfAvailable();
        this.chatClient = chatModel == null
                ? Optional.empty()
                : Optional.of(ChatClient.builder(chatModel).defaultSystem(SYSTEM_PROMPT).build());
    }

    public AiResponse ask(AiRequest request) {
        String prompt = request.prompt().trim();
        String context = normalize(request.context());

        return chatClient
                .map(client -> askModel(client, prompt, context))
                .orElseGet(() -> demoResponse(prompt, context));
    }

    private AiResponse askModel(ChatClient client, String prompt, String context) {
        String answer = client.prompt()
                .user(user -> user.text("""
                        Context:
                        {context}

                        Question:
                        {prompt}
                        """)
                        .param("context", context)
                        .param("prompt", prompt))
                .call()
                .content();

        return new AiResponse(
                answer,
                List.of(
                        "Review the suggested tradeoffs",
                        "Turn the response into a small implementation task",
                        "Add one test around the riskiest behavior"),
                "spring-ai-openai",
                Instant.now());
    }

    private AiResponse demoResponse(String prompt, String context) {
        String topic = prompt.length() > 90 ? prompt.substring(0, 90) + "..." : prompt;
        String answer = """
                Demo mode response for: "%s"

                A small Spring AI POC should keep the AI boundary narrow: one request DTO, one service that owns prompt construction, and one controller endpoint. Start with a deterministic fallback so the app stays runnable without secrets, then enable a real provider by setting OPENAI_API_KEY and SPRING_AI_CHAT_MODEL=openai. Keep generated output advisory, validate inputs before the model call, and log the mode so local testing is obvious.
                """.formatted(topic);

        if (StringUtils.hasText(context)) {
            answer += "\nContext noted: " + summarize(context);
        }

        return new AiResponse(
                answer,
                List.of(
                        "Set OPENAI_API_KEY to try a real model",
                        "Call POST /api/ai/ask with prompt and optional context",
                        "Keep prompts versioned as the POC grows"),
                "demo",
                Instant.now());
    }

    private String normalize(String value) {
        return StringUtils.hasText(value) ? value.trim() : "No additional context provided.";
    }

    private String summarize(String value) {
        String compact = value.replaceAll("\\s+", " ").trim();
        return compact.length() > 120 ? compact.substring(0, 120) + "..." : compact;
    }
}
