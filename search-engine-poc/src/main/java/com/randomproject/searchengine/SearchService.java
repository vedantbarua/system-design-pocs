package com.randomproject.searchengine;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.concurrent.atomic.AtomicLong;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
public class SearchService {
    private static final Pattern TOKEN_PATTERN = Pattern.compile("[a-z0-9]{2,}");

    private final Map<String, IndexedDocument> documents = new LinkedHashMap<>();
    private final Map<Integer, SearchShard> shards = new LinkedHashMap<>();
    private final AtomicLong sequence = new AtomicLong(1000);
    private final int defaultLimit;
    private final int shardCount;
    private final int maxQueryTerms;
    private final int maxDocumentLength;

    public SearchService(
            @Value("${search.default-limit:6}") int defaultLimit,
            @Value("${search.shard-count:4}") int shardCount,
            @Value("${search.max-query-terms:8}") int maxQueryTerms,
            @Value("${search.max-document-length:6000}") int maxDocumentLength) {
        this.defaultLimit = defaultLimit;
        this.shardCount = shardCount;
        this.maxQueryTerms = maxQueryTerms;
        this.maxDocumentLength = maxDocumentLength;
        for (int shardId = 0; shardId < shardCount; shardId++) {
            shards.put(shardId, new SearchShard(shardId));
        }
        seedDefaults();
    }

    public int getDefaultLimit() {
        return defaultLimit;
    }

    public int getShardCount() {
        return shardCount;
    }

    public synchronized IndexedDocument upsertDocument(DocumentRequest request) {
        NormalizedDocument normalized = normalizeDocument(request);
        Instant now = Instant.now();
        IndexedDocument existing = normalized.id() == null ? null : documents.get(normalized.id());
        String resolvedId = resolveId(normalized.id(), normalized.title());
        if (existing != null) {
            removeFromIndex(existing);
        }
        int shardId = shardIdFor(resolvedId);
        IndexedDocument document = new IndexedDocument(
                resolvedId,
                normalized.title(),
                normalized.url(),
                normalized.content(),
                normalized.tags(),
                shardId,
                normalized.tokenCount(),
                normalized.termFrequencies(),
                existing == null ? now : existing.createdAt(),
                now
        );
        documents.put(resolvedId, document);
        shards.get(shardId).add(document);
        return document;
    }

    public synchronized SearchResponse search(String query, Integer limit) {
        long startedAt = System.currentTimeMillis();
        List<String> terms = normalizeQuery(query);
        int resolvedLimit = normalizeLimit(limit);
        List<SearchShardStats> shardStats = new ArrayList<>();
        List<SearchCandidate> candidates = new ArrayList<>();

        for (SearchShard shard : shards.values()) {
            Set<String> candidateIds = new LinkedHashSet<>();
            for (String term : terms) {
                Map<String, Integer> posting = shard.postings.get(term);
                if (posting != null) {
                    candidateIds.addAll(posting.keySet());
                }
            }

            int matchedCount = 0;
            for (String candidateId : candidateIds) {
                IndexedDocument document = shard.documents.get(candidateId);
                if (document == null) {
                    continue;
                }
                ScoredDocument scored = scoreDocument(shard, document, terms);
                if (scored.score() <= 0) {
                    continue;
                }
                matchedCount++;
                candidates.add(new SearchCandidate(document, scored.score(), scored.matchedTerms()));
            }
            shardStats.add(new SearchShardStats(shard.shardId, candidateIds.size(), matchedCount));
        }

        List<SearchHit> results = candidates.stream()
                .sorted(Comparator
                        .comparingDouble(SearchCandidate::score).reversed()
                        .thenComparing(candidate -> candidate.document().updatedAt(), Comparator.reverseOrder())
                        .thenComparing(candidate -> candidate.document().title()))
                .limit(resolvedLimit)
                .map(candidate -> new SearchHit(
                        candidate.document().id(),
                        candidate.document().title(),
                        candidate.document().url(),
                        buildSnippet(candidate.document().content(), candidate.matchedTerms()),
                        round(candidate.score()),
                        candidate.document().shardId(),
                        candidate.matchedTerms()
                ))
                .toList();

        long tookMillis = System.currentTimeMillis() - startedAt;
        return new SearchResponse(query.trim(), terms, tookMillis, candidates.size(), results, shardStats);
    }

    public synchronized List<IndexedDocument> allDocuments() {
        return documents.values().stream()
                .sorted(Comparator.comparing(IndexedDocument::updatedAt).reversed())
                .toList();
    }

    public synchronized List<ShardSnapshot> shardSnapshots() {
        return shards.values().stream()
                .map(shard -> new ShardSnapshot(
                        shard.shardId,
                        shard.documents.size(),
                        shard.postings.size(),
                        shard.postingCount(),
                        shard.hottestTerms()
                ))
                .toList();
    }

    public synchronized SearchOverview overview() {
        int uniqueTerms = shards.values().stream()
                .map(shard -> shard.postings.keySet())
                .flatMap(Collection::stream)
                .collect(LinkedHashSet::new, Set::add, Set::addAll)
                .size();

        int totalPostingCount = shards.values().stream().mapToInt(SearchShard::postingCount).sum();
        double averageDocLength = documents.isEmpty()
                ? 0.0
                : documents.values().stream().mapToInt(IndexedDocument::tokenCount).average().orElse(0.0);
        return new SearchOverview(shardCount, documents.size(), uniqueTerms, totalPostingCount, round(averageDocLength));
    }

    private void seedDefaults() {
        upsertDocument(new DocumentRequest(
                "doc-search-architecture",
                "Search architecture for product docs",
                "https://docs.example.com/search-architecture",
                "Designing a search engine means balancing recall, ranking, indexing cost, and shard fanout. "
                        + "This document covers inverted indexes, term frequency, document frequency, result merging, and latency budgets.",
                "search,architecture,ranking"
        ));
        upsertDocument(new DocumentRequest(
                "doc-crawler-pipeline",
                "Crawler pipeline and freshness strategy",
                "https://docs.example.com/crawler-pipeline",
                "A crawler pipeline fetches pages, extracts canonical URLs, deduplicates content, and schedules recrawls. "
                        + "Freshness scoring keeps important pages warm while low quality pages are revisited less often.",
                "crawler,indexing,freshness"
        ));
        upsertDocument(new DocumentRequest(
                "doc-observability",
                "Observability playbook for distributed systems",
                "https://docs.example.com/observability",
                "Observability depends on structured logs, traces, metrics, and useful dashboards. "
                        + "Searchable event streams make incident response faster because operators can filter noisy services and pinpoint hot shards.",
                "observability,logging,distributed-systems"
        ));
        upsertDocument(new DocumentRequest(
                "doc-marketplace-ranking",
                "Marketplace ranking signals for ecommerce search",
                "https://docs.example.com/marketplace-ranking",
                "Marketplace search ranking combines lexical relevance with business signals such as conversion rate, inventory, freshness, and seller quality. "
                        + "Tokenized titles usually get stronger weight than long form descriptions.",
                "search,ecommerce,ranking"
        ));
        upsertDocument(new DocumentRequest(
                "doc-vector-vs-keyword",
                "Keyword search versus vector retrieval",
                "https://docs.example.com/vector-vs-keyword",
                "Keyword retrieval is precise for navigational queries and exact filters. "
                        + "Vector retrieval improves semantic recall, but many production systems blend both styles in a hybrid search stack.",
                "search,vector,hybrid"
        ));
        upsertDocument(new DocumentRequest(
                "doc-alert-routing",
                "Alert routing and notification deduplication",
                "https://docs.example.com/alert-routing",
                "Notification systems route alerts by severity, template, and provider health. "
                        + "Deduplication windows suppress repeated pages while retry queues handle transient failures.",
                "alerts,notification,queues"
        ));
    }

    private ScoredDocument scoreDocument(SearchShard shard, IndexedDocument document, List<String> queryTerms) {
        double averageLength = shard.documents.isEmpty()
                ? 1.0
                : Math.max(1.0, (double) shard.totalTerms / shard.documents.size());
        double score = 0.0;
        LinkedHashSet<String> matchedTerms = new LinkedHashSet<>();

        for (String term : queryTerms) {
            Map<String, Integer> posting = shard.postings.get(term);
            if (posting == null) {
                continue;
            }
            Integer termFrequency = posting.get(document.id());
            if (termFrequency == null) {
                continue;
            }
            matchedTerms.add(term);
            int documentFrequency = posting.size();
            double idf = Math.log(1.0 + ((shard.documents.size() - documentFrequency + 0.5) / (documentFrequency + 0.5)));
            double denominator = termFrequency + 1.2 * (1.0 - 0.75 + 0.75 * (document.tokenCount() / averageLength));
            score += idf * ((termFrequency * (1.2 + 1.0)) / denominator);
        }

        String normalizedContent = document.content().toLowerCase(Locale.ROOT);
        String normalizedTitle = document.title().toLowerCase(Locale.ROOT);
        String phrase = String.join(" ", queryTerms);
        if (!phrase.isBlank() && normalizedTitle.contains(phrase)) {
            score += 1.3;
        }
        if (!phrase.isBlank() && normalizedContent.contains(phrase)) {
            score += 0.8;
        }
        if (!Objects.equals(document.url(), "#") && queryTerms.stream().anyMatch(term -> document.url().toLowerCase(Locale.ROOT).contains(term))) {
            score += 0.25;
        }

        return new ScoredDocument(score, List.copyOf(matchedTerms));
    }

    private NormalizedDocument normalizeDocument(DocumentRequest request) {
        if (request == null) {
            throw new IllegalArgumentException("Document request is required.");
        }
        String title = normalizeRequiredText(request.title(), "Title", 140);
        String content = normalizeRequiredText(request.content(), "Content", maxDocumentLength);
        String id = normalizeOptionalId(request.id());
        String url = normalizeOptionalText(request.url(), 180);
        List<String> tags = normalizeTags(request.tags());
        Map<String, Integer> terms = new LinkedHashMap<>();
        mergeWeightedTerms(terms, tokenize(title), 3);
        mergeWeightedTerms(terms, tokenize(content), 1);
        mergeWeightedTerms(terms, tags, 2);
        if (terms.isEmpty()) {
            throw new IllegalArgumentException("Document must contain searchable terms.");
        }
        int tokenCount = terms.values().stream().mapToInt(Integer::intValue).sum();
        return new NormalizedDocument(id, title, url, content, tags, Map.copyOf(terms), tokenCount);
    }

    private List<String> normalizeQuery(String query) {
        if (!StringUtils.hasText(query)) {
            throw new IllegalArgumentException("Query cannot be empty.");
        }
        String trimmed = query.trim();
        if (trimmed.length() > 120) {
            throw new IllegalArgumentException("Query is too long.");
        }
        List<String> tokens = tokenize(trimmed);
        if (tokens.isEmpty()) {
            throw new IllegalArgumentException("Query must contain letters or numbers.");
        }
        if (tokens.size() > maxQueryTerms) {
            throw new IllegalArgumentException("Query may contain at most " + maxQueryTerms + " searchable terms.");
        }
        return tokens;
    }

    private int normalizeLimit(Integer limit) {
        int resolved = limit == null ? defaultLimit : limit;
        if (resolved <= 0 || resolved > 20) {
            throw new IllegalArgumentException("Limit must be between 1 and 20.");
        }
        return resolved;
    }

    private void removeFromIndex(IndexedDocument document) {
        SearchShard shard = shards.get(document.shardId());
        if (shard != null) {
            shard.remove(document);
        }
        documents.remove(document.id());
    }

    private String resolveId(String requestedId, String title) {
        if (requestedId != null && !requestedId.isBlank()) {
            return requestedId;
        }
        String base = slugify(title);
        String candidate = base;
        while (documents.containsKey(candidate)) {
            candidate = base + "-" + sequence.incrementAndGet();
        }
        return candidate;
    }

    private int shardIdFor(String documentId) {
        return Math.floorMod(documentId.hashCode(), shardCount);
    }

    private String normalizeOptionalId(String id) {
        if (!StringUtils.hasText(id)) {
            return null;
        }
        String normalized = id.trim().toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9\\-_/]", "-");
        if (normalized.length() > 60) {
            throw new IllegalArgumentException("ID must be at most 60 characters.");
        }
        return normalized;
    }

    private String normalizeRequiredText(String value, String field, int maxLength) {
        if (!StringUtils.hasText(value)) {
            throw new IllegalArgumentException(field + " cannot be empty.");
        }
        String normalized = value.trim().replaceAll("\\s+", " ");
        if (normalized.length() > maxLength) {
            throw new IllegalArgumentException(field + " is too long (max " + maxLength + ").");
        }
        return normalized;
    }

    private String normalizeOptionalText(String value, int maxLength) {
        if (!StringUtils.hasText(value)) {
            return "#";
        }
        String normalized = value.trim().replaceAll("\\s+", " ");
        if (normalized.length() > maxLength) {
            throw new IllegalArgumentException("Value is too long (max " + maxLength + ").");
        }
        return normalized;
    }

    private List<String> normalizeTags(String rawTags) {
        if (!StringUtils.hasText(rawTags)) {
            return List.of();
        }
        return List.of(rawTags.split(",")).stream()
                .map(String::trim)
                .filter(StringUtils::hasText)
                .map(tag -> tag.toLowerCase(Locale.ROOT))
                .distinct()
                .limit(8)
                .toList();
    }

    private List<String> tokenize(String value) {
        Matcher matcher = TOKEN_PATTERN.matcher(value.toLowerCase(Locale.ROOT));
        List<String> tokens = new ArrayList<>();
        while (matcher.find()) {
            tokens.add(matcher.group());
        }
        return tokens;
    }

    private void mergeWeightedTerms(Map<String, Integer> target, List<String> terms, int weight) {
        for (String term : terms) {
            target.merge(term, weight, Integer::sum);
        }
    }

    private String buildSnippet(String content, List<String> matchedTerms) {
        String normalized = content.replaceAll("\\s+", " ").trim();
        if (normalized.length() <= 180) {
            return normalized;
        }
        String lower = normalized.toLowerCase(Locale.ROOT);
        int index = -1;
        for (String term : matchedTerms) {
            index = lower.indexOf(term.toLowerCase(Locale.ROOT));
            if (index >= 0) {
                break;
            }
        }
        if (index < 0) {
            return normalized.substring(0, 177) + "...";
        }
        int start = Math.max(0, index - 55);
        int end = Math.min(normalized.length(), index + 125);
        String snippet = normalized.substring(start, end).trim();
        if (start > 0) {
            snippet = "..." + snippet;
        }
        if (end < normalized.length()) {
            snippet = snippet + "...";
        }
        return snippet;
    }

    private String slugify(String title) {
        String slug = title.toLowerCase(Locale.ROOT)
                .replaceAll("[^a-z0-9]+", "-")
                .replaceAll("^-+|-+$", "");
        if (slug.isBlank()) {
            slug = "doc-" + sequence.incrementAndGet();
        }
        return slug;
    }

    private double round(double value) {
        return Math.round(value * 100.0) / 100.0;
    }

    private record NormalizedDocument(
            String id,
            String title,
            String url,
            String content,
            List<String> tags,
            Map<String, Integer> termFrequencies,
            int tokenCount
    ) {
    }

    private record ScoredDocument(double score, List<String> matchedTerms) {
    }

    private record SearchCandidate(IndexedDocument document, double score, List<String> matchedTerms) {
    }

    private static final class SearchShard {
        private final int shardId;
        private final Map<String, IndexedDocument> documents = new LinkedHashMap<>();
        private final Map<String, Map<String, Integer>> postings = new HashMap<>();
        private int totalTerms;

        private SearchShard(int shardId) {
            this.shardId = shardId;
        }

        private void add(IndexedDocument document) {
            documents.put(document.id(), document);
            totalTerms += document.tokenCount();
            for (Map.Entry<String, Integer> entry : document.termFrequencies().entrySet()) {
                postings.computeIfAbsent(entry.getKey(), ignored -> new LinkedHashMap<>())
                        .put(document.id(), entry.getValue());
            }
        }

        private void remove(IndexedDocument document) {
            if (documents.remove(document.id()) == null) {
                return;
            }
            totalTerms -= document.tokenCount();
            for (String term : document.termFrequencies().keySet()) {
                Map<String, Integer> posting = postings.get(term);
                if (posting == null) {
                    continue;
                }
                posting.remove(document.id());
                if (posting.isEmpty()) {
                    postings.remove(term);
                }
            }
        }

        private int postingCount() {
            return postings.values().stream().mapToInt(Map::size).sum();
        }

        private List<String> hottestTerms() {
            return postings.entrySet().stream()
                    .sorted(Comparator.<Map.Entry<String, Map<String, Integer>>>comparingInt(entry -> entry.getValue().size()).reversed()
                            .thenComparing(Map.Entry::getKey))
                    .limit(5)
                    .map(entry -> entry.getKey() + " (" + entry.getValue().size() + ")")
                    .toList();
        }
    }
}
