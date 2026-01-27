package com.randomproject.netflix;

import java.time.Instant;

public record PlaybackResponse(
        String profileId,
        String contentId,
        int progress,
        boolean completed,
        Instant updatedAt
) {
}
