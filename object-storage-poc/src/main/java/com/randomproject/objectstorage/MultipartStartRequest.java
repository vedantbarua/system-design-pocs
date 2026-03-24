package com.randomproject.objectstorage;

import jakarta.validation.constraints.NotBlank;

public record MultipartStartRequest(
        @NotBlank String bucketId,
        @NotBlank String objectKey,
        String storageClass) {
}
