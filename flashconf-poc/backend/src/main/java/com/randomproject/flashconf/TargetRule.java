package com.randomproject.flashconf;

import java.util.ArrayList;
import java.util.List;

public class TargetRule {
    private String id;
    private boolean enabled;
    private List<Condition> conditions = new ArrayList<>();
    private Integer rolloutPercent;
    private String rolloutAttribute;

    public TargetRule() {
    }

    public TargetRule(String id, boolean enabled, List<Condition> conditions, Integer rolloutPercent, String rolloutAttribute) {
        this.id = id;
        this.enabled = enabled;
        if (conditions != null) {
            this.conditions = conditions;
        }
        this.rolloutPercent = rolloutPercent;
        this.rolloutAttribute = rolloutAttribute;
    }

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public boolean isEnabled() {
        return enabled;
    }

    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
    }

    public List<Condition> getConditions() {
        return conditions;
    }

    public void setConditions(List<Condition> conditions) {
        this.conditions = conditions;
    }

    public Integer getRolloutPercent() {
        return rolloutPercent;
    }

    public void setRolloutPercent(Integer rolloutPercent) {
        this.rolloutPercent = rolloutPercent;
    }

    public String getRolloutAttribute() {
        return rolloutAttribute;
    }

    public void setRolloutAttribute(String rolloutAttribute) {
        this.rolloutAttribute = rolloutAttribute;
    }
}
