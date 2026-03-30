package com.randomproject.cdn;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

public record PublishAssetRequest(
        @NotBlank String path,
        @NotBlank @Size(max = 60000) String content,
        @Positive Integer cacheTtlSeconds
) {
}
