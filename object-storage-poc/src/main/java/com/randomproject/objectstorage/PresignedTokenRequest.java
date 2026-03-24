package com.randomproject.objectstorage;

import jakarta.validation.constraints.NotBlank;

public record PresignedTokenRequest(
        @NotBlank String bucketId,
        @NotBlank String objectKey,
        String versionId,
        @NotBlank String operation,
        Integer ttlMinutes,
        String storageClass) {
}
