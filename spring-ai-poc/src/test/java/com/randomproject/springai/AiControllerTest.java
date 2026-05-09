package com.randomproject.springai;

import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(properties = "spring.ai.model.chat=none")
class AiControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    void askReturnsDemoResponseWhenNoModelIsConfigured() throws Exception {
        mockMvc.perform(post("/api/ai/ask")
                        .contentType("application/json")
                        .content("""
                                {
                                  "prompt": "How should this POC handle retries?",
                                  "context": "Keep it small and local."
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.mode").value("demo"))
                .andExpect(jsonPath("$.answer", containsString("retries")))
                .andExpect(jsonPath("$.nextActions[0]").value("Set OPENAI_API_KEY to try a real model"));
    }

    @Test
    void askRejectsBlankPrompt() throws Exception {
        mockMvc.perform(post("/api/ai/ask")
                        .contentType("application/json")
                        .content("""
                                {
                                  "prompt": " ",
                                  "context": "ignored"
                                }
                                """))
                .andExpect(status().isBadRequest());
    }
}
