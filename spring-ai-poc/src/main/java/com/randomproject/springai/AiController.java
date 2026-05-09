package com.randomproject.springai;

import jakarta.validation.Valid;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseBody;

@Controller
public class AiController {

    private final AiAssistantService aiAssistantService;

    public AiController(AiAssistantService aiAssistantService) {
        this.aiAssistantService = aiAssistantService;
    }

    @GetMapping("/")
    public String home() {
        return "index";
    }

    @PostMapping("/api/ai/ask")
    @ResponseBody
    public AiResponse ask(@Valid @RequestBody AiRequest request) {
        return aiAssistantService.ask(request);
    }
}
