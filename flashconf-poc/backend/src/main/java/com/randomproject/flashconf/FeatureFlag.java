package com.randomproject.flashconf;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

public class FeatureFlag {
    private String key;
    private String description;
    private boolean enabled;
    private List<TargetRule> rules = new ArrayList<>();
    private Instant updatedAt;

    public FeatureFlag() {
    }

    public FeatureFlag(String key, String description, boolean enabled, List<TargetRule> rules, Instant updatedAt) {
        this.key = key;
        this.description = description;
        this.enabled = enabled;
        if (rules != null) {
            this.rules = rules;
        }
        this.updatedAt = updatedAt;
    }

    public String getKey() {
        return key;
    }

    public void setKey(String key) {
        this.key = key;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public boolean isEnabled() {
        return enabled;
    }

    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
    }

    public List<TargetRule> getRules() {
        return rules;
    }

    public void setRules(List<TargetRule> rules) {
        this.rules = rules;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(Instant updatedAt) {
        this.updatedAt = updatedAt;
    }
}
