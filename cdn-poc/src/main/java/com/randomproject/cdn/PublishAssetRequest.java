package com.randomproject.cdn;

import jakarta.validation.constraints.NotBlank;

public record PublishAssetRequest(
        @NotBlank String path,
        @NotBlank String content,
        Integer cacheTtlSeconds) {
}
