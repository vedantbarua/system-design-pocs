package com.randomproject.springai;

import static org.assertj.core.api.Assertions.assertThat;

import jakarta.validation.Validation;
import jakarta.validation.Validator;

import org.junit.jupiter.api.Test;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.beans.factory.ObjectProvider;

class AiAssistantServiceTest {

    private final AiAssistantService service = new AiAssistantService(emptyChatModelProvider());

    @Test
    void askReturnsDemoResponseWhenNoModelIsConfigured() {
        AiResponse response = service.ask(new AiRequest(
                "How should this POC handle retries?",
                "Keep it small and local."));

        assertThat(response.mode()).isEqualTo("demo");
        assertThat(response.answer()).contains("retries");
        assertThat(response.nextActions()).contains("Set OPENAI_API_KEY to try a real model");
    }

    @Test
    void requestValidationRejectsBlankPrompt() {
        Validator validator = Validation.buildDefaultValidatorFactory().getValidator();

        var violations = validator.validate(new AiRequest(" ", "ignored"));

        assertThat(violations).anySatisfy(violation ->
                assertThat(violation.getMessage()).isEqualTo("Prompt is required"));
    }

    private static ObjectProvider<ChatModel> emptyChatModelProvider() {
        return new ObjectProvider<>() {
            @Override
            public ChatModel getObject() {
                return null;
            }

            @Override
            public ChatModel getIfAvailable() {
                return null;
            }
        };
    }
}
