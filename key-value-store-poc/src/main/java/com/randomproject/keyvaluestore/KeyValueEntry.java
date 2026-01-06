package com.randomproject.keyvaluestore;

import java.time.Instant;

public class KeyValueEntry {
    private final String key;
    private final String value;
    private final Instant createdAt;
    private final Instant updatedAt;
    private final Instant expiresAt;

    public KeyValueEntry(String key, String value, Instant createdAt, Instant updatedAt, Instant expiresAt) {
        this.key = key;
        this.value = value;
        this.createdAt = createdAt;
        this.updatedAt = updatedAt;
        this.expiresAt = expiresAt;
    }

    public String getKey() {
        return key;
    }

    public String getValue() {
        return value;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public Instant getExpiresAt() {
        return expiresAt;
    }

    public boolean isExpired(Instant now) {
        return expiresAt != null && expiresAt.isBefore(now);
    }
}
