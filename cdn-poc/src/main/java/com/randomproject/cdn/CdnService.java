package com.randomproject.cdn;

import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;

@Service
public class CdnService {
    private final Map<String, OriginAsset> originAssets;
    private final Map<String, EdgeState> edges;
    private final AtomicLong assetSequence;
    private final int edgeCapacity;
    private final int defaultTtlSeconds;
    private final int maxAssetSize;

    public CdnService(
            @org.springframework.beans.factory.annotation.Value("${cdn.edge-capacity:4}") int edgeCapacity,
            @org.springframework.beans.factory.annotation.Value("${cdn.default-ttl-seconds:60}") int defaultTtlSeconds,
            @org.springframework.beans.factory.annotation.Value("${cdn.max-asset-size:60000}") int maxAssetSize
    ) {
        if (edgeCapacity <= 0) {
            throw new IllegalArgumentException("Edge capacity must be positive.");
        }
        if (defaultTtlSeconds <= 0) {
            throw new IllegalArgumentException("Default TTL must be positive.");
        }
        if (maxAssetSize <= 0) {
            throw new IllegalArgumentException("Max asset size must be positive.");
        }
        this.originAssets = new LinkedHashMap<>();
        this.edges = new LinkedHashMap<>();
        this.assetSequence = new AtomicLong(1);
        this.edgeCapacity = edgeCapacity;
        this.defaultTtlSeconds = defaultTtlSeconds;
        this.maxAssetSize = maxAssetSize;
        this.edges.put("edge-na-1", new EdgeState("edge-na-1", "NA", edgeCapacity));
        this.edges.put("edge-eu-1", new EdgeState("edge-eu-1", "EU", edgeCapacity));
        this.edges.put("edge-ap-1", new EdgeState("edge-ap-1", "APAC", edgeCapacity));
    }

    public CdnDefaults defaults() {
        return new CdnDefaults(edgeCapacity, defaultTtlSeconds, maxAssetSize);
    }

    public synchronized OriginAsset publishAsset(String path, String content, Integer cacheTtlSeconds) {
        String normalizedPath = normalizePath(path);
        String normalizedContent = normalizeContent(content);
        int ttl = resolveTtl(cacheTtlSeconds);
        Instant now = Instant.now();
        OriginAsset existing = originAssets.get(normalizedPath);
        OriginAsset asset = new OriginAsset(
                existing == null ? "ast-" + assetSequence.getAndIncrement() : existing.id(),
                normalizedPath,
                normalizedContent,
                ttl,
                existing == null ? 1 : existing.version() + 1,
                now
        );
        originAssets.put(normalizedPath, asset);
        return asset;
    }

    public synchronized DeliveryResponse deliver(String path, String region, String edgeId) {
        String normalizedPath = normalizePath(path);
        EdgeState edge = selectEdge(region, edgeId);
        OriginAsset asset = originAssets.get(normalizedPath);
        if (asset == null) {
            throw new IllegalArgumentException("Origin asset not found: " + normalizedPath);
        }

        Instant now = Instant.now();
        CacheEntryState cached = edge.cache.get(normalizedPath);
        boolean expired = false;
        if (cached != null && !cached.expiresAt.isAfter(now)) {
            edge.cache.remove(normalizedPath);
            expired = true;
            cached = null;
        }

        boolean hit = cached != null;
        String cacheStatus;
        if (hit) {
            edge.hits++;
            cached.hitCount++;
            cacheStatus = "HIT";
            return new DeliveryResponse(
                    normalizedPath,
                    edge.edgeId,
                    edge.region,
                    cacheStatus,
                    cached.version,
                    secondsRemaining(now, cached.expiresAt),
                    estimateLatency(edge.region, resolveRegion(region), true),
                    cached.content
            );
        }

        edge.misses++;
        edge.originFetches++;
        cacheAsset(edge, asset, now);
        cacheStatus = expired ? "EXPIRED" : "MISS";
        CacheEntryState inserted = edge.cache.get(normalizedPath);
        return new DeliveryResponse(
                normalizedPath,
                edge.edgeId,
                edge.region,
                cacheStatus,
                inserted.version,
                secondsRemaining(now, inserted.expiresAt),
                estimateLatency(edge.region, resolveRegion(region), false),
                inserted.content
        );
    }

    public synchronized InvalidationResult invalidate(String path, String prefix) {
        String normalizedPath = StringUtils.hasText(path) ? normalizePath(path) : null;
        String normalizedPrefix = StringUtils.hasText(prefix) ? normalizePath(prefix).replaceAll("/+$", "/") : null;
        if (!StringUtils.hasText(normalizedPath) && !StringUtils.hasText(normalizedPrefix)) {
            throw new IllegalArgumentException("Provide either an exact path or a prefix.");
        }

        int entries = 0;
        int touchedEdges = 0;
        boolean exact = StringUtils.hasText(normalizedPath);
        for (EdgeState edge : edges.values()) {
            int before = edge.cache.size();
            if (exact) {
                if (edge.cache.remove(normalizedPath) != null) {
                    entries++;
                }
            } else {
                List<String> paths = new ArrayList<>(edge.cache.keySet());
                for (String cachedPath : paths) {
                    if (cachedPath.startsWith(normalizedPrefix)) {
                        edge.cache.remove(cachedPath);
                        entries++;
                    }
                }
            }
            if (edge.cache.size() != before) {
                touchedEdges++;
            }
        }

        return new InvalidationResult(
                exact ? "PATH" : "PREFIX",
                exact ? normalizedPath : normalizedPrefix,
                touchedEdges,
                entries
        );
    }

    public List<OriginAsset> listOriginAssets() {
        synchronized (this) {
            return originAssets.values().stream()
                    .sorted(Comparator.comparing(OriginAsset::updatedAt).reversed())
                    .toList();
        }
    }

    public List<EdgeSummary> listEdges() {
        synchronized (this) {
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
    }

    public List<CachedAssetView> listCachedAssets() {
        synchronized (this) {
            Instant now = Instant.now();
            List<CachedAssetView> views = new ArrayList<>();
            for (EdgeState edge : edges.values()) {
                edge.cache.entrySet().removeIf(entry -> !entry.getValue().expiresAt.isAfter(now));
                edge.cache.values().forEach(entry -> views.add(new CachedAssetView(
                        edge.edgeId,
                        edge.region,
                        entry.path,
                        entry.version,
                        entry.cachedAt,
                        entry.expiresAt,
                        entry.hitCount
                )));
            }
            return views.stream()
                    .sorted(Comparator.comparing(CachedAssetView::cachedAt).reversed())
                    .toList();
        }
    }

    private void cacheAsset(EdgeState edge, OriginAsset asset, Instant now) {
        edge.cache.entrySet().removeIf(entry -> !entry.getValue().expiresAt.isAfter(now));
        edge.cache.remove(asset.path());
        if (edge.cache.size() >= edge.capacity) {
            String eldestKey = edge.cache.keySet().iterator().next();
            edge.cache.remove(eldestKey);
            edge.evictions++;
        }
        edge.cache.put(asset.path(), new CacheEntryState(
                asset.path(),
                asset.content(),
                asset.version(),
                now,
                now.plusSeconds(asset.cacheTtlSeconds())
        ));
    }

    private EdgeState selectEdge(String region, String edgeId) {
        if (StringUtils.hasText(edgeId)) {
            EdgeState edge = edges.get(edgeId.trim());
            if (edge == null) {
                throw new IllegalArgumentException("Unknown edge id: " + edgeId.trim());
            }
            return edge;
        }
        String resolvedRegion = resolveRegion(region);
        return switch (resolvedRegion) {
            case "EU" -> edges.get("edge-eu-1");
            case "APAC" -> edges.get("edge-ap-1");
            default -> edges.get("edge-na-1");
        };
    }

    private String resolveRegion(String region) {
        if (!StringUtils.hasText(region)) {
            return "NA";
        }
        return switch (region.trim().toUpperCase(Locale.ROOT)) {
            case "NA", "EU", "APAC" -> region.trim().toUpperCase(Locale.ROOT);
            default -> throw new IllegalArgumentException("Region must be one of: NA, EU, APAC.");
        };
    }

    private int estimateLatency(String edgeRegion, String clientRegion, boolean cacheHit) {
        int base = cacheHit ? 18 : 95;
        if (!edgeRegion.equals(clientRegion)) {
            base += cacheHit ? 12 : 35;
        }
        return base;
    }

    private long secondsRemaining(Instant now, Instant expiresAt) {
        return Math.max(0, expiresAt.getEpochSecond() - now.getEpochSecond());
    }

    private int resolveTtl(Integer ttlSeconds) {
        if (ttlSeconds == null) {
            return defaultTtlSeconds;
        }
        if (ttlSeconds <= 0) {
            throw new IllegalArgumentException("TTL must be at least 1 second.");
        }
        return ttlSeconds;
    }

    private String normalizePath(String path) {
        if (!StringUtils.hasText(path)) {
            throw new IllegalArgumentException("Path cannot be empty.");
        }
        String normalized = path.trim();
        if (!normalized.startsWith("/")) {
            throw new IllegalArgumentException("Path must start with '/'.");
        }
        if (normalized.contains("..")) {
            throw new IllegalArgumentException("Path cannot contain '..'.");
        }
        return normalized;
    }

    private String normalizeContent(String content) {
        if (!StringUtils.hasText(content)) {
            throw new IllegalArgumentException("Content cannot be empty.");
        }
        String normalized = content.trim();
        if (normalized.length() > maxAssetSize) {
            throw new IllegalArgumentException("Content exceeds max asset size of " + maxAssetSize + " bytes.");
        }
        return normalized;
    }

    private static final class EdgeState {
        private final String edgeId;
        private final String region;
        private final int capacity;
        private final LinkedHashMap<String, CacheEntryState> cache;
        private long hits;
        private long misses;
        private long originFetches;
        private long evictions;

        private EdgeState(String edgeId, String region, int capacity) {
            this.edgeId = edgeId;
            this.region = region;
            this.capacity = capacity;
            this.cache = new LinkedHashMap<>(16, 0.75f, true);
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
            this.hitCount = 0;
        }
    }
}
