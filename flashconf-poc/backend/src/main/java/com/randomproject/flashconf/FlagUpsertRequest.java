package com.randomproject.flashconf;

import java.util.ArrayList;
import java.util.List;

public class FlagUpsertRequest {
    private String key;
    private String description;
    private boolean enabled;
    private List<TargetRule> rules = new ArrayList<>();
    private String actor;

    public FlagUpsertRequest() {
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

    public String getActor() {
        return actor;
    }

    public void setActor(String actor) {
        this.actor = actor;
    }
}
