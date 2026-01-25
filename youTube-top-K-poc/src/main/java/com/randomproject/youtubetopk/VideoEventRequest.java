package com.randomproject.youtubetopk;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.PositiveOrZero;

public record VideoEventRequest(
        @NotBlank String id,
        @PositiveOrZero Long viewDelta,
        @PositiveOrZero Long likeDelta
) {
}
