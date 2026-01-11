package com.randomproject.webcrawler;

public record CrawlSummary(
        int visited,
        int fetched,
        int errors,
        int linksFound
) {
}
