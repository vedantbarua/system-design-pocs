package com.randomproject.flashconf;

public class EvaluationResult {
    private final boolean enabled;
    private final String reason;

    public EvaluationResult(boolean enabled, String reason) {
        this.enabled = enabled;
        this.reason = reason;
    }

    public boolean isEnabled() {
        return enabled;
    }

    public String getReason() {
        return reason;
    }
}
