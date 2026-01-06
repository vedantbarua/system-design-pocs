package com.randomproject.keyvaluestore;

import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Pattern;

@Service
public class KeyValueStoreService {
    private static final Pattern KEY_PATTERN = Pattern.compile("^[A-Za-z0-9._:-]+$");
    private final Map<String, KeyValueEntry> entries = new ConcurrentHashMap<>();

    public synchronized List<KeyValueEntry> all() {
        purgeExpired();
        return new ArrayList<>(entries.values());
    }

    public synchronized Optional<KeyValueEntry> get(String key) {
        String normalizedKey = normalizeKey(key);
        KeyValueEntry entry = entries.get(normalizedKey);
        if (entry == null) {
            return Optional.empty();
        }
        if (entry.isExpired(Instant.now())) {
            entries.remove(normalizedKey);
            return Optional.empty();
        }
        return Optional.of(entry);
    }

    public synchronized KeyValueEntry put(String key, String value, Integer ttlSeconds) {
        String normalizedKey = normalizeKey(key);
        String normalizedValue = normalizeValue(value);
        Instant now = Instant.now();
        Instant expiresAt = ttlSeconds == null ? null : now.plusSeconds(validateTtl(ttlSeconds));
        KeyValueEntry existing = entries.get(normalizedKey);
        Instant createdAt = existing == null ? now : existing.getCreatedAt();
        KeyValueEntry entry = new KeyValueEntry(normalizedKey, normalizedValue, createdAt, now, expiresAt);
        entries.put(normalizedKey, entry);
        return entry;
    }

    public synchronized boolean delete(String key) {
        if (!StringUtils.hasText(key)) {
            return false;
        }
        return entries.remove(key.trim()) != null;
    }

    private void purgeExpired() {
        Instant now = Instant.now();
        entries.entrySet().removeIf(entry -> entry.getValue().isExpired(now));
    }

    private String normalizeKey(String key) {
        if (!StringUtils.hasText(key)) {
            throw new IllegalArgumentException("Key cannot be empty.");
        }
        String normalized = key.trim();
        if (!KEY_PATTERN.matcher(normalized).matches()) {
            throw new IllegalArgumentException("Key must use letters, numbers, '.', '-', '_', or ':'.");
        }
        return normalized;
    }

    private String normalizeValue(String value) {
        if (!StringUtils.hasText(value)) {
            throw new IllegalArgumentException("Value cannot be empty.");
        }
        return value.trim();
    }

    private int validateTtl(int ttlSeconds) {
        if (ttlSeconds <= 0) {
            throw new IllegalArgumentException("TTL must be at least 1 second.");
        }
        return ttlSeconds;
    }
}
