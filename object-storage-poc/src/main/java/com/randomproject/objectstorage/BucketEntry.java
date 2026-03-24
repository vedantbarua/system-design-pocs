package com.randomproject.objectstorage;

import java.time.Instant;

public record BucketEntry(
        String id,
        String name,
        boolean versioningEnabled,
        Instant createdAt) {
}
