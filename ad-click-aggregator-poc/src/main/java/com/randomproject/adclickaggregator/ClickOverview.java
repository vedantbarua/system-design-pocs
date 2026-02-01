package com.randomproject.adclickaggregator;

public record ClickOverview(
        long totalClicks,
        long totalSpendCents,
        long uniqueAds,
        long uniqueCampaigns,
        long uniquePublishers
) {
}
