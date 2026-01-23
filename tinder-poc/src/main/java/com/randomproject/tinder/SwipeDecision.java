package com.randomproject.tinder;

public enum SwipeDecision {
    LIKE("Like"),
    DISLIKE("Nope"),
    SUPERLIKE("Super like");

    private final String label;

    SwipeDecision(String label) {
        this.label = label;
    }

    public String getLabel() {
        return label;
    }
}
