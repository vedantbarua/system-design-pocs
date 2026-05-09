package com.randomproject.springai;

import java.time.Instant;
import java.util.List;

public record AiResponse(
        String answer,
        List<String> nextActions,
        String mode,
        Instant generatedAt) {
}
