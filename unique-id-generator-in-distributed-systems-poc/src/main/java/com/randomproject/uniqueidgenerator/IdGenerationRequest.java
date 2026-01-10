package com.randomproject.uniqueidgenerator;

import jakarta.validation.constraints.Min;

public record IdGenerationRequest(
        @Min(0)
        Integer nodeId,
        @Min(1)
        Integer count
) {
}
