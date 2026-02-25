package com.randomproject.flashconf;

import java.util.Map;
import java.util.Objects;
import java.util.TreeMap;

public class RulesetCacheKey {
    private final String clientId;
    private final Map<String, String> attributes;

    public RulesetCacheKey(String clientId, Map<String, String> attributes) {
        this.clientId = clientId == null ? "unknown" : clientId;
        this.attributes = new TreeMap<>(attributes);
    }

    public String getClientId() {
        return clientId;
    }

    public Map<String, String> getAttributes() {
        return attributes;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        RulesetCacheKey that = (RulesetCacheKey) o;
        return Objects.equals(clientId, that.clientId) && Objects.equals(attributes, that.attributes);
    }

    @Override
    public int hashCode() {
        return Objects.hash(clientId, attributes);
    }
}
