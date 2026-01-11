package com.randomproject.webcrawler;

import java.time.Instant;
import java.util.List;

public record CrawlPage(
        String url,
        int depth,
        Integer statusCode,
        String contentType,
        String title,
        int linksFound,
        List<String> sampleLinks,
        String error,
        Instant fetchedAt
) {
}
