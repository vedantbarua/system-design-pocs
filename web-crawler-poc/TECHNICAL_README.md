# Technical README: Web Crawler POC

This document explains the architecture, flow, and file-by-file purpose of the web crawler proof-of-concept.

## Architecture Overview
- **Framework**: Spring Boot 3.2 with MVC and Thymeleaf for the UI.
- **Crawler**: Single-threaded breadth-first traversal with max depth and max page limits.
- **Service**: `CrawlerService` validates input, applies defaults, fetches pages, and extracts links.
- **Controller**: `WebCrawlerController` renders the UI and exposes JSON endpoints.
- **Views**: `index.html` provides the crawl form and a results table.

## File Structure
```
web-crawler-poc/
├── pom.xml                                      # Maven configuration (Spring Boot, Thymeleaf, validation)
├── src/main/java/com/randomproject/webcrawler/
│   ├── WebCrawlerPocApplication.java            # Boots the Spring application
│   ├── WebCrawlerController.java                # MVC + REST endpoints
│   ├── CrawlerService.java                      # Crawl loop, validation, HTML parsing
│   ├── CrawlRequest.java                        # Validation-backed request payload
│   ├── CrawlDefaults.java                       # UI default configuration
│   ├── CrawlResult.java                         # Aggregate crawl output
│   ├── CrawlSummary.java                        # Summary counts
│   └── CrawlPage.java                           # Per-page result payload
└── src/main/resources/
    ├── application.properties                   # Port + crawler defaults
    └── templates/
        └── index.html                            # UI for starting crawls and viewing results
```

## Flow
1. **Home**: GET `/` renders the form with defaults.
2. **Crawl (UI)**: POST `/crawl` validates inputs, runs the crawl, and redirects with flash results.
3. **Crawl (API)**: POST `/api/crawl` returns a JSON `CrawlResult`.

## Notable Implementation Details
- **Scope control**: `sameHostOnly` keeps the crawl within the starting hostname.
- **HTML parsing**: Links are extracted with a regex and resolved against the base URI.
- **Safety limits**: The crawler stops at `maxDepth` or `maxPages`.
- **User agent**: Configured in `application.properties` and attached to every request.

## Configuration
- `server.port=8088` — avoid clashing with other POCs.
- `crawler.max-depth=2` — default crawl depth.
- `crawler.max-pages=20` — default page cap.
- `crawler.delay-ms=0` — optional delay between requests.
- `crawler.same-host=true` — default to same-host crawling.
- `crawler.user-agent=RandomProjectsCrawler/1.0` — UA string.
- `crawler.timeout-ms=4000` — per-request timeout.

## Build/Run
- `mvn org.springframework.boot:spring-boot-maven-plugin:run`
