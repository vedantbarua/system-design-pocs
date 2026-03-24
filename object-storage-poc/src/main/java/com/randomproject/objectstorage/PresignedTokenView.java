package com.randomproject.objectstorage;

import java.time.Instant;

public record PresignedTokenView(
        String token,
        String bucketId,
        String objectKey,
        String versionId,
        String operation,
        String storageClass,
        Instant expiresAt,
        boolean consumed) {
}
