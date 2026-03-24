package com.randomproject.objectstorage;

import jakarta.validation.constraints.NotBlank;

public record PresignedUploadRequest(
        @NotBlank String content) {
}
