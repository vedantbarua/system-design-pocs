package com.randomproject.objectstorage;

import java.time.Instant;
import java.util.List;

public record MultipartUploadView(
        String uploadId,
        String bucketId,
        String objectKey,
        String storageClass,
        Instant createdAt,
        List<Integer> uploadedParts,
        int uploadedBytes) {
}
