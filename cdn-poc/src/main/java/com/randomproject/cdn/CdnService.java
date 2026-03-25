package com.randomproject.cdn;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

@Service
public class CdnService {
    private final Map<String, OriginAsset> originAssets = new ConcurrentHashMap<>();
    private final Map<String, EdgeState> edges = new LinkedHashMap<>();
    private final AtomicLong assetSequence = new AtomicLong(1);
    private final int edgeCapacity;
    private final int defaultTtlSeconds;
    private final int maxAssetSize;

    public CdnService(
            @Value("${cdn.edge-capacity:4}") int edgeCapacity,
            @Value("${cdn.default-ttl-seconds:60}") int defaultTtlSeconds,
            @Value("${cdn.max-asset-size:60000}") int maxAssetSize) {
        this.edgeCapacity = edgeCapacity;
        this.defaultTtlSeconds = defaultTtlSeconds;
        this.maxAssetSize = maxAssetSize;
        edges.put("edge-na-1", new EdgeState("edge-na-1", "NA", edgeCapacity));
        edges.put("edge-eu-1", new EdgeState("edge-eu-1", "EU", edgeCapacity));
        edges.put("edge-ap-1", new EdgeState("edge-ap-1", "APAC", edgeCapacity));
    }

    public CdnDefaults defaults() {
        return new CdnDefaults(edgeCapacity, defaultTtlSeconds, maxAssetSize);
    }

    public synchronized OriginAsset publishAsset(String path, String content, Integer cacheTtlSeconds) {
        String normalizedPath = normalizePath(path);
        String normalizedContent = normalizeContent(content);
        int ttl = resolveTtl(cacheTtlSeconds);
        OriginAsset existing = originAssets.get(normalizedPath);
        int nextVersion = existing == null ? 1 : existing.version() + 1;
        OriginAsset asset = new OriginAsset(
                existing == null ? "ast-" + assetSequence.getAndIncrement() : existing.id(),
                normalizedPath,
                normalizedContent,
                ttl,
                nextVersion,
                Instant.now());
        originAssets.put(normalizedPath, asset);
        return asset;
    }

    public synchronized DeliveryResponse deliver(String path, String region, String edgeId) {
        String normalizedPath = normalizePath(path);
        OriginAsset asset = originAssets.get(normalizedPath);
        if (asset == null) {
            throw new IllegalArgumentException("Origin asset not found.");
        }
        EdgeState edge = selectEdge(region, edgeId);
        Instant now = Instant.now();
        CacheEntryState cached = edge.cache.get(normalizedPath);
        if (cached != null && cached.expiresAt.isAfter(now)) {
            cached.hitCount += 1;
            edge.hits += 1;
            return new DeliveryResponse(
                    asset.path(),
                    edge.edgeId,
                    edge.region,
                    "HIT",
                    cached.version,
                    secondsRemaining(now, cached.expiresAt),
                    estimateLatency(edge.region, resolveRegion(region), false),
                    cached.content);
        }
        String status = cached != null ? "EXPIRED" : "MISS";
        if (cached != null) {
            edge.cache.remove(normalizedPath);
        }
        edge.misses += 1;
        edge.originFetches += 1;
        cacheAsset(edge, asset, now);
        return new DeliveryResponse(
                asset.path(),
                edge.edgeId,
                edge.region,
                status,
                asset.version(),
                asset.cacheTtlSeconds(),
                estimateLatency(edge.region, resolveRegion(region), true),
                asset.content());
    }

    public synchronized InvalidationResult invalidate(String path, String prefix) {
        String normalizedPath = StringUtils.hasText(path) ? normalizePath(path) : null;
        String normalizedPrefix = StringUtils.hasText(prefix) ? normalizePath(prefix) : null;
        if (normalizedPath == null && normalizedPrefix == null) {
            throw new IllegalArgumentException("Either path or prefix is required.");
        }
        int invalidatedEdges = 0;
        int invalidatedEntries = 0;
        for (EdgeState edge : edges.values()) {
            List<String> keysToRemove = new ArrayList<>();
            for (String cachedPath : edge.cache.keySet()) {
                boolean match = normalizedPath != null
                        ? cachedPath.equals(normalizedPath)
                        : cachedPath.startsWith(normalizedPrefix);
                if (match) {
                    keysToRemove.add(cachedPath);
                }
            }
            if (!keysToRemove.isEmpty()) {
                invalidatedEdges += 1;
                invalidatedEntries += keysToRemove.size();
                for (String key : keysToRemove) {
                    edge.cache.remove(key);
                }
            }
        }
        return new InvalidationResult(
                normalizedPath != null ? "PATH" : "PREFIX",
                normalizedPath != null ? normalizedPath : normalizedPrefix,
                invalidatedEdges,
                invalidatedEntries);
    }

    public List<OriginAsset> listOriginAssets() {
        return originAssets.values().stream()
                .sorted(Comparator.comparing(OriginAsset::updatedAt).reversed())
                .toList();
    }

    public List<EdgeSummary> listEdges() {
        return edges.values().stream()
                .map(edge -> new EdgeSummary(
                        edge.edgeId,
                        edge.region,
                        edge.capacity,
                        edge.cache.size(),
                        edge.hits,
                        edge.misses,
                        edge.originFetches,
                        edge.evictions))
                .toList();
    }

    public List<CachedAssetView> listCachedAssets() {
        List<CachedAssetView> results = new ArrayList<>();
        for (EdgeState edge : edges.values()) {
            for (CacheEntryState entry : edge.cache.values()) {
                results.add(new CachedAssetView(
                        edge.edgeId,
                        edge.region,
                        entry.path,
                        entry.version,
                        entry.cachedAt,
                        entry.expiresAt,
                        entry.hitCount));
            }
        }
        results.sort(Comparator.comparing(CachedAssetView::cachedAt).reversed());
        return results;
    }

    private void cacheAsset(EdgeState edge, OriginAsset asset, Instant now) {
        if (!edge.cache.containsKey(asset.path()) && edge.cache.size() >= edge.capacity) {
            String oldest = edge.cache.keySet().iterator().next();
            edge.cache.remove(oldest);
            edge.evictions += 1;
        }
        edge.cache.put(asset.path(), new CacheEntryState(
                asset.path(),
                asset.content(),
                asset.version(),
                now,
                now.plusSeconds(asset.cacheTtlSeconds())));
    }

    private EdgeState selectEdge(String requestedRegion, String requestedEdgeId) {
        if (StringUtils.hasText(requestedEdgeId)) {
            EdgeState edge = edges.get(requestedEdgeId.trim());
            if (edge == null) {
                throw new IllegalArgumentException("Requested edge was not found.");
            }
            return edge;
        }
        String region = resolveRegion(requestedRegion);
        return switch (region) {
            case "EU" -> edges.get("edge-eu-1");
            case "APAC" -> edges.get("edge-ap-1");
            default -> edges.get("edge-na-1");
        };
    }

    private String resolveRegion(String requestedRegion) {
        if (!StringUtils.hasText(requestedRegion)) {
            return "NA";
        }
        String normalized = requestedRegion.trim().toUpperCase();
        if (!normalized.equals("NA") && !normalized.equals("EU") && !normalized.equals("APAC")) {
            throw new IllegalArgumentException("Region must be NA, EU, or APAC.");
        }
        return normalized;
    }

    private int estimateLatency(String edgeRegion, String requestRegion, boolean originFetch) {
        int base = edgeRegion.equals(requestRegion) ? 24 : 78;
        return originFetch ? base + 65 : base;
    }

    private long secondsRemaining(Instant now, Instant expiresAt) {
        long seconds = Duration.between(now, expiresAt).toSeconds();
        return Math.max(seconds, 0);
    }

    private int resolveTtl(Integer cacheTtlSeconds) {
        int ttl = cacheTtlSeconds == null ? defaultTtlSeconds : cacheTtlSeconds;
        if (ttl <= 0) {
            throw new IllegalArgumentException("TTL seconds must be at least 1.");
        }
        return ttl;
    }

    private String normalizePath(String path) {
        if (!StringUtils.hasText(path)) {
            throw new IllegalArgumentException("Path is required.");
        }
        String normalized = path.trim();
        if (!normalized.startsWith("/")) {
            throw new IllegalArgumentException("Path must start with '/'.");
        }
        if (normalized.length() > 180) {
            throw new IllegalArgumentException("Path must be at most 180 characters.");
        }
        return normalized;
    }

    private String normalizeContent(String content) {
        if (!StringUtils.hasText(content)) {
            throw new IllegalArgumentException("Content cannot be empty.");
        }
        String normalized = content.trim();
        if (normalized.length() > maxAssetSize) {
            throw new IllegalArgumentException("Asset exceeds max size of " + maxAssetSize + " characters.");
        }
        return normalized;
    }

    private static final class EdgeState {
        private final String edgeId;
        private final String region;
        private final int capacity;
        private final LinkedHashMap<String, CacheEntryState> cache = new LinkedHashMap<>(16, 0.75f, true);
        private long hits;
        private long misses;
        private long originFetches;
        private long evictions;

        private EdgeState(String edgeId, String region, int capacity) {
            this.edgeId = edgeId;
            this.region = region;
            this.capacity = capacity;
        }
    }

    private static final class CacheEntryState {
        private final String path;
        private final String content;
        private final int version;
        private final Instant cachedAt;
        private final Instant expiresAt;
        private long hitCount;

        private CacheEntryState(String path, String content, int version, Instant cachedAt, Instant expiresAt) {
            this.path = path;
            this.content = content;
            this.version = version;
            this.cachedAt = cachedAt;
            this.expiresAt = expiresAt;
        }
    }
}
