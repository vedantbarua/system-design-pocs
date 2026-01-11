package com.randomproject.webcrawler;

import java.time.Instant;
import java.util.List;

public record CrawlResult(
        String startUrl,
        int maxDepth,
        int maxPages,
        int delayMillis,
        boolean sameHostOnly,
        Instant startedAt,
        Instant finishedAt,
        long durationMillis,
        CrawlSummary summary,
        List<CrawlPage> pages
) {
}
