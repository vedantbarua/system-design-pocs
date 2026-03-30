package com.randomproject.cdn;

import jakarta.validation.constraints.NotBlank;

public record DeliverRequest(
        @NotBlank String path,
        String region,
        String edgeId
) {
}
