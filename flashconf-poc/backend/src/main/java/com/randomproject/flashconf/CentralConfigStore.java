package com.randomproject.flashconf;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

public class CentralConfigStore {
    private final Map<String, FeatureFlag> flags = new ConcurrentHashMap<>();

    public List<FeatureFlag> list() {
        return new ArrayList<>(flags.values());
    }

    public Optional<FeatureFlag> get(String key) {
        return Optional.ofNullable(flags.get(key));
    }

    public Map<String, FeatureFlag> snapshot() {
        return new LinkedHashMap<>(flags);
    }

    public FeatureFlag upsert(FeatureFlag flag) {
        flags.put(flag.getKey(), flag);
        return flag;
    }

    public Optional<FeatureFlag> delete(String key) {
        return Optional.ofNullable(flags.remove(key));
    }
}
