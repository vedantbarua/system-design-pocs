package com.randomproject.searchengine;

import java.time.Instant;
import java.util.List;
import java.util.Map;

public record IndexedDocument(
        String id,
        String title,
        String url,
        String content,
        List<String> tags,
        int shardId,
        int tokenCount,
        Map<String, Integer> termFrequencies,
        Instant createdAt,
        Instant updatedAt
) {
}
