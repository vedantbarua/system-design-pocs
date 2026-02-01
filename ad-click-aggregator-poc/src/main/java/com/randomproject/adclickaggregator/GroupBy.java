package com.randomproject.adclickaggregator;

public enum GroupBy {
    AD,
    CAMPAIGN,
    PUBLISHER;

    public static GroupBy from(String raw) {
        if (raw == null || raw.isBlank()) {
            return CAMPAIGN;
        }
        return GroupBy.valueOf(raw.trim().toUpperCase());
    }
}
