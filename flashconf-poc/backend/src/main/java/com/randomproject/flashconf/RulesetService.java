package com.randomproject.flashconf;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;

import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;

public class RulesetService {
    private final CentralConfigStore store;
    private final TargetingEngine engine;
    private final Cache<RulesetCacheKey, RulesetResponse> cache;

    public RulesetService(CentralConfigStore store, TargetingEngine engine, Duration ttl, int maxSize) {
        this.store = store;
        this.engine = engine;
        this.cache = Caffeine.newBuilder()
                .expireAfterWrite(ttl)
                .maximumSize(maxSize)
                .build();
    }

    public RulesetResponse getRuleset(String clientId, Map<String, String> attributes) {
        RulesetCacheKey key = new RulesetCacheKey(clientId, attributes);
        RulesetResponse cached = cache.getIfPresent(key);
        if (cached != null) {
            cached.setCacheHit(true);
            return cached;
        }
        RulesetResponse computed = computeRuleset(clientId, attributes);
        cache.put(key, computed);
        computed.setCacheHit(false);
        return computed;
    }

    public void invalidateAll() {
        cache.invalidateAll();
    }

    private RulesetResponse computeRuleset(String clientId, Map<String, String> attributes) {
        Map<String, FeatureFlag> snapshot = store.snapshot();
        Map<String, Boolean> flags = new LinkedHashMap<>();
        Map<String, String> debug = new LinkedHashMap<>();
        for (FeatureFlag flag : snapshot.values()) {
            EvaluationResult result = engine.evaluate(flag, attributes);
            flags.put(flag.getKey(), result.isEnabled());
            debug.put(flag.getKey(), result.getReason());
        }
        return new RulesetResponse(clientId, attributes, flags, debug, Instant.now(), false);
    }
}
