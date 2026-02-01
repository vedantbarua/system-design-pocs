package com.randomproject.adclickaggregator;

public record ClickSummary(
        String groupKey,
        long clicks,
        long spendCents,
        long uniquePublishers,
        long uniqueAds
) {
}
