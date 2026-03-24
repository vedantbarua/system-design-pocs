package com.randomproject.objectstorage;

import java.time.Instant;

public record ObjectVersion(
        String bucketId,
        String objectKey,
        String versionId,
        String content,
        int size,
        String etag,
        String storageClass,
        Instant createdAt,
        boolean current) {
}
