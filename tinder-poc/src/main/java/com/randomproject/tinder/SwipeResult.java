package com.randomproject.tinder;

public class SwipeResult {
    private final Profile profile;
    private final SwipeDecision decision;
    private final boolean matched;
    private final String message;

    public SwipeResult(Profile profile, SwipeDecision decision, boolean matched, String message) {
        this.profile = profile;
        this.decision = decision;
        this.matched = matched;
        this.message = message;
    }

    public Profile getProfile() {
        return profile;
    }

    public SwipeDecision getDecision() {
        return decision;
    }

    public boolean isMatched() {
        return matched;
    }

    public String getMessage() {
        return message;
    }
}
