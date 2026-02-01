package com.randomproject.adclickaggregator;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.PositiveOrZero;

public record ClickIngestRequest(
        @NotBlank String adId,
        @NotBlank String campaignId,
        @NotBlank String publisherId,
        String occurredAt,
        @PositiveOrZero long costCents
) {
}
