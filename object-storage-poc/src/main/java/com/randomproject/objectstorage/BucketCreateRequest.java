package com.randomproject.objectstorage;

import jakarta.validation.constraints.NotBlank;

public record BucketCreateRequest(
        @NotBlank String name,
        boolean versioningEnabled) {
}
