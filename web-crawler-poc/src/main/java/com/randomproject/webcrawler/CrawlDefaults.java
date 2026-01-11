package com.randomproject.webcrawler;

public record CrawlDefaults(
        int maxDepth,
        int maxPages,
        int delayMillis,
        boolean sameHostOnly,
        String userAgent,
        int timeoutMillis
) {
}
