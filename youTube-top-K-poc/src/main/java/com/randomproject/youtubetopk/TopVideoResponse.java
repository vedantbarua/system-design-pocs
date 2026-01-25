package com.randomproject.youtubetopk;

import java.time.Instant;
import java.util.List;

public record TopVideoResponse(
        int rank,
        String id,
        String title,
        String channel,
        List<String> tags,
        long views,
        long likes,
        long score,
        Instant updatedAt
) {
}
