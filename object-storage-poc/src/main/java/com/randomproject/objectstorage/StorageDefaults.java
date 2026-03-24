package com.randomproject.objectstorage;

public record StorageDefaults(
        int maxObjectSize,
        int defaultTokenTtlMinutes) {
}
