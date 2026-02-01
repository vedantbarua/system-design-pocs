package com.randomproject.adclickaggregator;

import java.time.Instant;

public record ClickEvent(
        String id,
        String adId,
        String campaignId,
        String publisherId,
        Instant occurredAt,
        long costCents
) {
}
