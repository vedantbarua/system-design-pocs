package com.randomproject.netflix;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;

public record PlaybackRequest(
        @NotBlank String profileId,
        @NotBlank String contentId,
        @Min(0) @Max(100) Integer progress,
        Boolean completed
) {
}
