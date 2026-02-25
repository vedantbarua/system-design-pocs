package com.randomproject.flashconf;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.Objects;

public class TargetingEngine {

    public EvaluationResult evaluate(FeatureFlag flag, Map<String, String> attributes) {
        if (flag.getRules() != null) {
            for (TargetRule rule : flag.getRules()) {
                if (ruleMatches(rule, attributes)) {
                    if (rule.getRolloutPercent() != null) {
                        if (!passesRollout(rule, attributes)) {
                            return new EvaluationResult(false, "rule:" + rule.getId() + " (rollout) blocked");
                        }
                    }
                    return new EvaluationResult(rule.isEnabled(), "rule:" + rule.getId());
                }
            }
        }
        return new EvaluationResult(flag.isEnabled(), "default");
    }

    private boolean ruleMatches(TargetRule rule, Map<String, String> attributes) {
        List<Condition> conditions = rule.getConditions();
        if (conditions == null || conditions.isEmpty()) {
            return true;
        }
        for (Condition condition : conditions) {
            if (!conditionMatches(condition, attributes)) {
                return false;
            }
        }
        return true;
    }

    private boolean conditionMatches(Condition condition, Map<String, String> attributes) {
        String value = attributes.get(condition.getAttribute());
        List<String> values = condition.getValues();
        Operator operator = condition.getOperator();
        if (operator == null) {
            return false;
        }
        if (values == null) {
            return false;
        }

        return switch (operator) {
            case EQUALS -> Objects.equals(value, first(values));
            case NOT_EQUALS -> value != null && !Objects.equals(value, first(values));
            case IN -> value != null && values.contains(value);
            case NOT_IN -> value != null && !values.contains(value);
            case CONTAINS -> value != null && value.contains(first(values));
        };
    }

    private String first(List<String> values) {
        return values.isEmpty() ? null : values.get(0);
    }

    private boolean passesRollout(TargetRule rule, Map<String, String> attributes) {
        int pct = Math.max(0, Math.min(100, rule.getRolloutPercent()));
        String rolloutAttr = rule.getRolloutAttribute() == null ? "userId" : rule.getRolloutAttribute();
        String key = attributes.get(rolloutAttr);
        if (key == null) {
            return false;
        }
        int hash = Math.abs(murmurHash(key)) % 100;
        return hash < pct;
    }

    private int murmurHash(String value) {
        byte[] data = value.getBytes(StandardCharsets.UTF_8);
        int h = 0;
        for (byte b : data) {
            h = (h * 31) + b;
        }
        return h;
    }
}
