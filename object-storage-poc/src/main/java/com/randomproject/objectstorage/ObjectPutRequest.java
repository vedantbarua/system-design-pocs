package com.randomproject.objectstorage;

import jakarta.validation.constraints.NotBlank;

public record ObjectPutRequest(
        @NotBlank String bucketId,
        @NotBlank String objectKey,
        @NotBlank String content,
        String storageClass) {
}
