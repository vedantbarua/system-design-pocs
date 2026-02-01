package com.randomproject.adclickaggregator;

import java.time.temporal.ChronoUnit;

public enum BucketInterval {
    MINUTE(ChronoUnit.MINUTES),
    HOUR(ChronoUnit.HOURS),
    DAY(ChronoUnit.DAYS);

    private final ChronoUnit chronoUnit;

    BucketInterval(ChronoUnit chronoUnit) {
        this.chronoUnit = chronoUnit;
    }

    public ChronoUnit chronoUnit() {
        return chronoUnit;
    }

    public static BucketInterval from(String raw) {
        if (raw == null || raw.isBlank()) {
            return HOUR;
        }
        return BucketInterval.valueOf(raw.trim().toUpperCase());
    }
}
