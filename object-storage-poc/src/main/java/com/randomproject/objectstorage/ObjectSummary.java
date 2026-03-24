package com.randomproject.objectstorage;

import java.time.Instant;

public record ObjectSummary(
        String bucketId,
        String objectKey,
        String currentVersionId,
        int versionCount,
        int size,
        String etag,
        String storageClass,
        Instant updatedAt) {
}
