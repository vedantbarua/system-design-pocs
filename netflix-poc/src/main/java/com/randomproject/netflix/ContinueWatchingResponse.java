package com.randomproject.netflix;

import java.time.Instant;

public record ContinueWatchingResponse(
        String id,
        String title,
        int progress,
        Instant updatedAt
) {
}
