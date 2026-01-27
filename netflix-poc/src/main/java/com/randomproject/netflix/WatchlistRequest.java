package com.randomproject.netflix;

import jakarta.validation.constraints.NotBlank;

public record WatchlistRequest(
        @NotBlank String profileId,
        @NotBlank String contentId,
        Boolean remove
) {
}
