package com.randomproject.springai;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record AiRequest(
        @NotBlank(message = "Prompt is required")
        @Size(max = 2_000, message = "Prompt must be 2,000 characters or fewer")
        String prompt,

        @Size(max = 2_000, message = "Context must be 2,000 characters or fewer")
        String context) {
}
