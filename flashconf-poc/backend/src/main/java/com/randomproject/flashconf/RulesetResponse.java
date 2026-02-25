package com.randomproject.flashconf;

import java.time.Instant;
import java.util.Map;

public class RulesetResponse {
    private String clientId;
    private Map<String, String> attributes;
    private Map<String, Boolean> flags;
    private Map<String, String> debug;
    private Instant evaluatedAt;
    private boolean cacheHit;

    public RulesetResponse() {
    }

    public RulesetResponse(String clientId, Map<String, String> attributes, Map<String, Boolean> flags,
                           Map<String, String> debug, Instant evaluatedAt, boolean cacheHit) {
        this.clientId = clientId;
        this.attributes = attributes;
        this.flags = flags;
        this.debug = debug;
        this.evaluatedAt = evaluatedAt;
        this.cacheHit = cacheHit;
    }

    public String getClientId() {
        return clientId;
    }

    public void setClientId(String clientId) {
        this.clientId = clientId;
    }

    public Map<String, String> getAttributes() {
        return attributes;
    }

    public void setAttributes(Map<String, String> attributes) {
        this.attributes = attributes;
    }

    public Map<String, Boolean> getFlags() {
        return flags;
    }

    public void setFlags(Map<String, Boolean> flags) {
        this.flags = flags;
    }

    public Map<String, String> getDebug() {
        return debug;
    }

    public void setDebug(Map<String, String> debug) {
        this.debug = debug;
    }

    public Instant getEvaluatedAt() {
        return evaluatedAt;
    }

    public void setEvaluatedAt(Instant evaluatedAt) {
        this.evaluatedAt = evaluatedAt;
    }

    public boolean isCacheHit() {
        return cacheHit;
    }

    public void setCacheHit(boolean cacheHit) {
        this.cacheHit = cacheHit;
    }
}
