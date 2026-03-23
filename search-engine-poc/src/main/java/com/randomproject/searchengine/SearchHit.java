package com.randomproject.searchengine;

import java.util.List;

public record SearchHit(
        String documentId,
        String title,
        String url,
        String snippet,
        double score,
        int shardId,
        List<String> matchedTerms
) {
}
