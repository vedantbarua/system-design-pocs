package com.randomproject.searchengine;

public record SearchOverview(
        int shardCount,
        int documentCount,
        int uniqueTermCount,
        int totalPostingCount,
        double averageDocumentLength
) {
}
