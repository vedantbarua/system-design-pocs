package com.randomproject.objectstorage;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public record MultipartPartRequest(
        @NotNull Integer partNumber,
        @NotBlank String content) {
}
