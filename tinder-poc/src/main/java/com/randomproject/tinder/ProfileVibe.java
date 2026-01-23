package com.randomproject.tinder;

public enum ProfileVibe {
    GOLDEN_HOUR("Golden hour", "vibe-golden"),
    MIDNIGHT("Midnight", "vibe-midnight"),
    COASTAL("Coastal", "vibe-coastal"),
    BLOOM("Bloom", "vibe-bloom"),
    URBAN("Urban", "vibe-urban"),
    LAVENDER("Lavender", "vibe-lavender");

    private final String label;
    private final String cssClass;

    ProfileVibe(String label, String cssClass) {
        this.label = label;
        this.cssClass = cssClass;
    }

    public String getLabel() {
        return label;
    }

    public String getCssClass() {
        return cssClass;
    }
}
