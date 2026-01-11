package com.randomproject.webcrawler;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.net.URI;
import java.net.URISyntaxException;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Queue;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
public class CrawlerService {
    private static final Pattern HREF_PATTERN = Pattern.compile("(?i)href\\s*=\\s*(?:\"([^\"]+)\"|'([^']+)')");
    private static final Pattern TITLE_PATTERN = Pattern.compile("(?i)<title>(.*?)</title>", Pattern.DOTALL);
    private static final int SAMPLE_LINK_LIMIT = 5;

    private final HttpClient httpClient;
    private final int defaultMaxDepth;
    private final int defaultMaxPages;
    private final int defaultDelayMillis;
    private final boolean defaultSameHost;
    private final String userAgent;
    private final int timeoutMillis;

    public CrawlerService(
            @Value("${crawler.max-depth:2}") int defaultMaxDepth,
            @Value("${crawler.max-pages:20}") int defaultMaxPages,
            @Value("${crawler.delay-ms:0}") int defaultDelayMillis,
            @Value("${crawler.same-host:true}") boolean defaultSameHost,
            @Value("${crawler.user-agent:RandomProjectsCrawler/1.0}") String userAgent,
            @Value("${crawler.timeout-ms:4000}") int timeoutMillis) {
        this.defaultMaxDepth = defaultMaxDepth;
        this.defaultMaxPages = defaultMaxPages;
        this.defaultDelayMillis = defaultDelayMillis;
        this.defaultSameHost = defaultSameHost;
        this.userAgent = userAgent;
        this.timeoutMillis = timeoutMillis;
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofMillis(timeoutMillis))
                .followRedirects(HttpClient.Redirect.NORMAL)
                .build();
    }

    public CrawlDefaults defaults() {
        return new CrawlDefaults(defaultMaxDepth, defaultMaxPages, defaultDelayMillis, defaultSameHost, userAgent, timeoutMillis);
    }

    public CrawlResult crawl(CrawlRequest request) {
        URI startUri = normalizeStartUrl(request.startUrl());
        int maxDepth = resolveMaxDepth(request.maxDepth());
        int maxPages = resolveMaxPages(request.maxPages());
        int delayMillis = resolveDelayMillis(request.delayMillis());
        boolean sameHostOnly = resolveSameHostOnly(request.sameHostOnly());

        String startHost = startUri.getHost();
        String normalizedStart = stripFragment(startUri).toString();

        Queue<CrawlTarget> queue = new ArrayDeque<>();
        Set<String> seen = new HashSet<>();
        List<CrawlPage> pages = new ArrayList<>();

        queue.add(new CrawlTarget(startUri, 0));
        seen.add(normalizedStart);

        int totalLinks = 0;
        int errors = 0;
        Instant startedAt = Instant.now();

        while (!queue.isEmpty() && pages.size() < maxPages) {
            CrawlTarget target = queue.poll();
            CrawlPage page = fetchPage(target, maxDepth, maxPages, sameHostOnly, startHost, queue, seen);
            pages.add(page);
            totalLinks += page.linksFound();
            if (page.error() != null || (page.statusCode() != null && page.statusCode() >= 400)) {
                errors++;
            }
            if (delayMillis > 0 && !queue.isEmpty() && pages.size() < maxPages) {
                try {
                    Thread.sleep(delayMillis);
                } catch (InterruptedException ex) {
                    Thread.currentThread().interrupt();
                    break;
                }
            }
        }

        Instant finishedAt = Instant.now();
        long durationMillis = Duration.between(startedAt, finishedAt).toMillis();
        CrawlSummary summary = new CrawlSummary(pages.size(), pages.size(), errors, totalLinks);

        return new CrawlResult(
                normalizedStart,
                maxDepth,
                maxPages,
                delayMillis,
                sameHostOnly,
                startedAt,
                finishedAt,
                durationMillis,
                summary,
                pages
        );
    }

    private CrawlPage fetchPage(CrawlTarget target,
                                int maxDepth,
                                int maxPages,
                                boolean sameHostOnly,
                                String startHost,
                                Queue<CrawlTarget> queue,
                                Set<String> seen) {
        Instant fetchedAt = Instant.now();
        Integer statusCode = null;
        String contentType = null;
        String title = null;
        String error = null;
        List<String> sampleLinks = new ArrayList<>();
        int linksFound = 0;

        try {
            HttpRequest httpRequest = HttpRequest.newBuilder(target.uri())
                    .timeout(Duration.ofMillis(timeoutMillis))
                    .header("User-Agent", userAgent)
                    .GET()
                    .build();
            HttpResponse<String> response = httpClient.send(httpRequest, HttpResponse.BodyHandlers.ofString());
            statusCode = response.statusCode();
            contentType = response.headers().firstValue("Content-Type").orElse(null);
            if (statusCode >= 200 && statusCode < 400) {
                String body = response.body();
                title = extractTitle(body);
                if (isHtml(contentType)) {
                    List<String> links = extractLinks(body);
                    linksFound = links.size();
                    for (String link : links) {
                        URI resolved = resolveLink(target.uri(), link);
                        if (resolved == null) {
                            continue;
                        }
                        if (sameHostOnly && !sameHost(startHost, resolved.getHost())) {
                            continue;
                        }
                        URI cleaned = stripFragment(resolved);
                        String normalized = cleaned.toString();
                        if (sampleLinks.size() < SAMPLE_LINK_LIMIT) {
                            sampleLinks.add(normalized);
                        }
                        int nextDepth = target.depth() + 1;
                        if (nextDepth > maxDepth || seen.size() >= maxPages) {
                            continue;
                        }
                        if (seen.add(normalized)) {
                            queue.add(new CrawlTarget(cleaned, nextDepth));
                        }
                    }
                }
            }
        } catch (Exception ex) {
            error = ex.getMessage();
        }

        return new CrawlPage(
                stripFragment(target.uri()).toString(),
                target.depth(),
                statusCode,
                contentType,
                title,
                linksFound,
                sampleLinks,
                error,
                fetchedAt
        );
    }

    private URI normalizeStartUrl(String startUrl) {
        if (!StringUtils.hasText(startUrl)) {
            throw new IllegalArgumentException("Start URL is required.");
        }
        String trimmed = startUrl.trim();
        URI uri = URI.create(trimmed);
        String scheme = uri.getScheme();
        if (!"http".equalsIgnoreCase(scheme) && !"https".equalsIgnoreCase(scheme)) {
            throw new IllegalArgumentException("Start URL must begin with http:// or https://.");
        }
        if (!StringUtils.hasText(uri.getHost())) {
            throw new IllegalArgumentException("Start URL must include a host.");
        }
        return uri;
    }

    private int resolveMaxDepth(Integer maxDepth) {
        int resolved = maxDepth == null ? defaultMaxDepth : maxDepth;
        if (resolved < 0) {
            throw new IllegalArgumentException("Max depth cannot be negative.");
        }
        return resolved;
    }

    private int resolveMaxPages(Integer maxPages) {
        int resolved = maxPages == null ? defaultMaxPages : maxPages;
        if (resolved < 1) {
            throw new IllegalArgumentException("Max pages must be at least 1.");
        }
        return resolved;
    }

    private int resolveDelayMillis(Integer delayMillis) {
        int resolved = delayMillis == null ? defaultDelayMillis : delayMillis;
        if (resolved < 0) {
            throw new IllegalArgumentException("Delay cannot be negative.");
        }
        return resolved;
    }

    private boolean resolveSameHostOnly(Boolean sameHostOnly) {
        return sameHostOnly == null ? defaultSameHost : sameHostOnly;
    }

    private boolean isHtml(String contentType) {
        if (!StringUtils.hasText(contentType)) {
            return false;
        }
        return contentType.toLowerCase(Locale.ROOT).contains("text/html");
    }

    private List<String> extractLinks(String html) {
        List<String> links = new ArrayList<>();
        Matcher matcher = HREF_PATTERN.matcher(html);
        while (matcher.find()) {
            String link = matcher.group(1);
            if (link == null) {
                link = matcher.group(2);
            }
            if (StringUtils.hasText(link)) {
                links.add(link.trim());
            }
        }
        return links;
    }

    private String extractTitle(String html) {
        if (!StringUtils.hasText(html)) {
            return null;
        }
        Matcher matcher = TITLE_PATTERN.matcher(html);
        if (matcher.find()) {
            String raw = matcher.group(1);
            if (raw != null) {
                String cleaned = raw.replaceAll("\\s+", " ").trim();
                return cleaned.isEmpty() ? null : cleaned;
            }
        }
        return null;
    }

    private URI resolveLink(URI base, String link) {
        String trimmed = link.trim();
        if (trimmed.isEmpty() || trimmed.startsWith("#")) {
            return null;
        }
        String lowered = trimmed.toLowerCase(Locale.ROOT);
        if (lowered.startsWith("mailto:") || lowered.startsWith("javascript:")
                || lowered.startsWith("tel:") || lowered.startsWith("data:")) {
            return null;
        }
        try {
            URI resolved = base.resolve(trimmed).normalize();
            String scheme = resolved.getScheme();
            if (!"http".equalsIgnoreCase(scheme) && !"https".equalsIgnoreCase(scheme)) {
                return null;
            }
            if (!StringUtils.hasText(resolved.getHost())) {
                return null;
            }
            return resolved;
        } catch (IllegalArgumentException ex) {
            return null;
        }
    }

    private URI stripFragment(URI uri) {
        try {
            return new URI(uri.getScheme(), uri.getAuthority(), uri.getPath(), uri.getQuery(), null);
        } catch (URISyntaxException ex) {
            return uri;
        }
    }

    private boolean sameHost(String first, String second) {
        if (!StringUtils.hasText(first) || !StringUtils.hasText(second)) {
            return false;
        }
        return first.equalsIgnoreCase(second);
    }

    private record CrawlTarget(URI uri, int depth) {
    }
}
