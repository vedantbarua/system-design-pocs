package com.randomproject.distributedcache;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.Deque;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.NavigableMap;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.TreeMap;
import java.util.function.LongSupplier;
import java.util.regex.Pattern;

@Service
public class DistributedCacheService {
    private static final Pattern ID_PATTERN = Pattern.compile("^[A-Za-z0-9._:-]+$");
    private static final int MAX_EVENT_COUNT = 18;
    private static final long REPLICA_LAG_STEP_MILLIS = 25L;

    private final NavigableMap<Long, String> ring = new TreeMap<>(Long::compareUnsigned);
    private final Map<String, List<Long>> nodeTokens = new LinkedHashMap<>();
    private final Map<String, CacheNodeState> nodes = new LinkedHashMap<>();
    private final Deque<ClusterEvent> events = new ArrayDeque<>();
    private final int virtualNodes;
    private final int replicationFactor;
    private final int nodeCapacity;
    private final int defaultTtlSeconds;
    private final int maxTtlSeconds;
    private final LongSupplier timeSource;

    public DistributedCacheService(
            @Value("${cache.virtual-nodes:64}") int virtualNodes,
            @Value("${cache.replication-factor:2}") int replicationFactor,
            @Value("${cache.node-capacity:12}") int nodeCapacity,
            @Value("${cache.default-ttl-seconds:180}") int defaultTtlSeconds,
            @Value("${cache.max-ttl-seconds:3600}") int maxTtlSeconds,
            @Value("${cache.initial-nodes:cache-a,cache-b,cache-c,cache-d}") String initialNodes) {
        this(
                virtualNodes,
                replicationFactor,
                nodeCapacity,
                defaultTtlSeconds,
                maxTtlSeconds,
                parseInitialNodes(initialNodes),
                System::currentTimeMillis);
    }

    DistributedCacheService(
            int virtualNodes,
            int replicationFactor,
            int nodeCapacity,
            int defaultTtlSeconds,
            int maxTtlSeconds,
            List<String> initialNodes,
            LongSupplier timeSource) {
        if (virtualNodes < 1) {
            throw new IllegalArgumentException("virtual-nodes must be at least 1");
        }
        if (replicationFactor < 1) {
            throw new IllegalArgumentException("replication-factor must be at least 1");
        }
        if (nodeCapacity < 1) {
            throw new IllegalArgumentException("node-capacity must be at least 1");
        }
        if (defaultTtlSeconds < 1 || maxTtlSeconds < defaultTtlSeconds) {
            throw new IllegalArgumentException("TTL configuration is invalid");
        }
        if (initialNodes == null || initialNodes.isEmpty()) {
            throw new IllegalArgumentException("At least one cache node is required");
        }
        this.virtualNodes = virtualNodes;
        this.replicationFactor = replicationFactor;
        this.nodeCapacity = nodeCapacity;
        this.defaultTtlSeconds = defaultTtlSeconds;
        this.maxTtlSeconds = maxTtlSeconds;
        this.timeSource = timeSource;
        for (String nodeId : initialNodes) {
            addNodeInternal(nodeId);
        }
        addEvent("topology", "Cluster booted with nodes " + String.join(", ", nodes.keySet()) + ".");
    }

    public synchronized CacheConfigSnapshot configSnapshot() {
        return new CacheConfigSnapshot(
                virtualNodes,
                effectiveReplicationFactor(),
                nodeCapacity,
                defaultTtlSeconds,
                maxTtlSeconds,
                List.copyOf(nodes.keySet()));
    }

    public synchronized ClusterSnapshot snapshot() {
        long now = now();
        purgeExpired(now);
        List<CacheKeyPlacementView> keys = currentKeyPlacements(now);
        List<CacheNodeView> nodeViews = nodeViews(now);
        List<CacheShardView> shards = shardViews();
        int failoverCount = (int) keys.stream().filter(CacheKeyPlacementView::failoverActive).count();
        return new ClusterSnapshot(
                configSnapshot(),
                nodes.size(),
                (int) nodes.values().stream().filter(node -> node.active).count(),
                keys.size(),
                failoverCount,
                keys,
                shards,
                nodeViews,
                List.copyOf(events));
    }

    public synchronized CacheReadResult put(String key, String value, Integer ttlSeconds) {
        long now = now();
        purgeExpired(now);
        String normalizedKey = normalizeId(key, "key", 80);
        String normalizedValue = normalizeValue(value);
        int resolvedTtl = normalizeTtl(ttlSeconds);
        List<String> owners = ownersForKey(normalizedKey, ring, nodes.keySet());
        if (owners.isEmpty()) {
            throw new IllegalArgumentException("No cache nodes available.");
        }
        String activePrimary = firstAliveOwner(owners)
                .orElseThrow(() -> new IllegalArgumentException("All replicas for key '" + normalizedKey + "' are down."));
        StoredEntry latest = findLatestCopy(normalizedKey, now).orElse(null);
        long version = latest == null ? 1 : latest.version + 1;
        Long expiresAt = now + (resolvedTtl * 1000L);

        for (int index = 0; index < owners.size(); index++) {
            String owner = owners.get(index);
            CacheNodeState node = nodes.get(owner);
            if (!node.active) {
                addEvent("replication", "Skipped write to down node " + owner + " for key " + normalizedKey + ".");
                continue;
            }
            long lagMillis = owner.equals(activePrimary) ? 0L : index * REPLICA_LAG_STEP_MILLIS;
            StoredEntry entry = new StoredEntry(normalizedKey, normalizedValue, version, now, expiresAt, 0);
            storeEntry(node, entry, owner.equals(activePrimary), lagMillis);
        }

        if (!Objects.equals(owners.get(0), activePrimary)) {
            addEvent(
                    "failover",
                    "Write for key " + normalizedKey + " failed over from " + owners.get(0) + " to " + activePrimary + ".");
        } else {
            addEvent("write", "Stored key " + normalizedKey + " on primary " + activePrimary + ".");
        }
        return readInternal(normalizedKey, now)
                .orElseThrow(() -> new IllegalStateException("Written value was not readable."));
    }

    public synchronized Optional<CacheReadResult> get(String key) {
        long now = now();
        purgeExpired(now);
        String normalizedKey = normalizeId(key, "key", 80);
        return readInternal(normalizedKey, now);
    }

    public synchronized boolean delete(String key) {
        long now = now();
        purgeExpired(now);
        String normalizedKey = normalizeId(key, "key", 80);
        boolean removed = false;
        for (CacheNodeState node : nodes.values()) {
            removed |= node.entries.remove(normalizedKey) != null;
        }
        if (removed) {
            addEvent("delete", "Deleted key " + normalizedKey + " from the cluster.");
        }
        return removed;
    }

    public synchronized CacheKeyPlacementView placement(String key) {
        long now = now();
        purgeExpired(now);
        String normalizedKey = normalizeId(key, "key", 80);
        return buildPlacement(normalizedKey, now)
                .orElseThrow(() -> new IllegalArgumentException("Key not found in cache."));
    }

    public synchronized NodeToggleResult setNodeActive(String nodeId, boolean active) {
        long now = now();
        purgeExpired(now);
        String normalizedNodeId = normalizeExistingNode(nodeId);
        CacheNodeState node = nodes.get(normalizedNodeId);
        if (node.active == active) {
            return new NodeToggleResult(normalizedNodeId, active, affectedKeys(normalizedNodeId), 0);
        }
        node.active = active;
        int affectedKeys = affectedKeys(normalizedNodeId);
        int restoredCopies = 0;
        if (active) {
            restoredCopies = restoreNodeCopies(normalizedNodeId, now);
            addEvent("topology", "Node " + normalizedNodeId + " returned. Restored " + restoredCopies + " copies.");
        } else {
            addEvent("topology", "Node " + normalizedNodeId + " marked down. " + affectedKeys + " owned keys may fail over.");
        }
        return new NodeToggleResult(normalizedNodeId, active, affectedKeys, restoredCopies);
    }

    public synchronized HotKeySimulationResult simulateHotKey(String key, Integer requests) {
        long now = now();
        purgeExpired(now);
        String normalizedKey = normalizeId(key, "key", 80);
        if (findLatestCopy(normalizedKey, now).isEmpty()) {
            throw new IllegalArgumentException("Write the key before simulating hot-key traffic.");
        }
        int resolvedRequests = normalizeRequestCount(requests);
        Map<String, Long> before = nodeHitCounters();
        boolean failoverObserved = false;
        for (int i = 0; i < resolvedRequests; i++) {
            CacheReadResult result = readInternal(normalizedKey, now)
                    .orElseThrow(() -> new IllegalStateException("Hot key disappeared during simulation."));
            failoverObserved |= result.failoverActive();
        }
        Map<String, Long> deltas = new LinkedHashMap<>();
        String hottestNode = null;
        long hottestHits = Long.MIN_VALUE;
        for (Map.Entry<String, CacheNodeState> entry : nodes.entrySet()) {
            long delta = entry.getValue().hitsServed - before.getOrDefault(entry.getKey(), 0L);
            deltas.put(entry.getKey(), delta);
            if (delta > hottestHits) {
                hottestHits = delta;
                hottestNode = entry.getKey();
            }
        }
        addEvent("traffic", "Simulated " + resolvedRequests + " reads for hot key " + normalizedKey + ".");
        return new HotKeySimulationResult(normalizedKey, resolvedRequests, hottestNode, deltas, failoverObserved);
    }

    public synchronized RebalancePreview previewRebalance(String candidateNodeId) {
        long now = now();
        purgeExpired(now);
        String normalizedNodeId = normalizeId(candidateNodeId, "candidateNodeId", 40);
        if (nodes.containsKey(normalizedNodeId)) {
            throw new IllegalArgumentException("Node " + normalizedNodeId + " already exists.");
        }
        NavigableMap<Long, String> projectedRing = new TreeMap<>(Long::compareUnsigned);
        projectedRing.putAll(ring);
        for (int i = 0; i < virtualNodes; i++) {
            projectedRing.put(hashValue(normalizedNodeId + "#" + i), normalizedNodeId);
        }
        Set<String> projectedNodes = new LinkedHashSet<>(nodes.keySet());
        projectedNodes.add(normalizedNodeId);

        List<CacheKeyPlacementView> currentKeys = currentKeyPlacements(now);
        List<MovedKeyView> movedKeys = new ArrayList<>();
        int primaryMoves = 0;
        int replicaMoves = 0;
        for (CacheKeyPlacementView key : currentKeys) {
            List<String> currentOwners = ownersForKey(key.key(), ring, nodes.keySet());
            List<String> projectedOwners = ownersForKey(key.key(), projectedRing, projectedNodes);
            if (!Objects.equals(currentOwners.get(0), projectedOwners.get(0))) {
                primaryMoves++;
                movedKeys.add(new MovedKeyView(key.key(), currentOwners.get(0), projectedOwners.get(0)));
            }
            if (!new LinkedHashSet<>(currentOwners).equals(new LinkedHashSet<>(projectedOwners))) {
                replicaMoves++;
            }
        }
        addEvent(
                "rebalance",
                "Previewed adding node " + normalizedNodeId + " across " + currentKeys.size() + " keys.");
        return new RebalancePreview(
                normalizedNodeId,
                currentKeys.size(),
                primaryMoves,
                replicaMoves,
                movedKeys.stream().limit(8).toList());
    }

    private Optional<CacheReadResult> readInternal(String normalizedKey, long now) {
        List<String> owners = ownersForKey(normalizedKey, ring, nodes.keySet());
        if (owners.isEmpty()) {
            return Optional.empty();
        }
        String preferredPrimary = owners.get(0);
        String activePrimary = firstAliveOwner(owners).orElse(null);
        CopyLocation freshest = freshestActiveOwnerCopy(normalizedKey, owners, now).orElse(null);
        if (freshest == null) {
            return Optional.empty();
        }
        freshest.node.hitsServed++;
        freshest.entry.hitCount++;
        repairStaleOwners(normalizedKey, owners, freshest.entry, freshest.node.nodeId);
        return Optional.of(new CacheReadResult(
                normalizedKey,
                freshest.entry.value,
                freshest.entry.version,
                Instant.ofEpochMilli(freshest.entry.writtenAtMillis),
                Instant.ofEpochMilli(freshest.entry.expiresAtMillis),
                ttlRemainingSeconds(freshest.entry.expiresAtMillis, now),
                freshest.node.nodeId,
                preferredPrimary,
                activePrimary,
                owners.stream().skip(1).toList(),
                !Objects.equals(preferredPrimary, freshest.node.nodeId)));
    }

    private void repairStaleOwners(String key, List<String> owners, StoredEntry source, String servedByNode) {
        for (int index = 0; index < owners.size(); index++) {
            String ownerId = owners.get(index);
            CacheNodeState node = nodes.get(ownerId);
            if (!node.active || ownerId.equals(servedByNode)) {
                continue;
            }
            StoredEntry existing = node.entries.get(key);
            if (existing == null || existing.version < source.version) {
                storeEntry(node, source.copy(), false, index * REPLICA_LAG_STEP_MILLIS);
            }
        }
    }

    private int restoreNodeCopies(String nodeId, long now) {
        int restored = 0;
        for (String key : distinctKeys()) {
            List<String> owners = ownersForKey(key, ring, nodes.keySet());
            if (!owners.contains(nodeId)) {
                continue;
            }
            StoredEntry latest = findLatestCopy(key, now).orElse(null);
            if (latest == null) {
                continue;
            }
            CacheNodeState node = nodes.get(nodeId);
            StoredEntry existing = node.entries.get(key);
            if (existing == null || existing.version < latest.version) {
                storeEntry(node, latest.copy(), false, REPLICA_LAG_STEP_MILLIS);
                restored++;
            }
        }
        return restored;
    }

    private int affectedKeys(String nodeId) {
        int count = 0;
        for (String key : distinctKeys()) {
            List<String> owners = ownersForKey(key, ring, nodes.keySet());
            if (owners.contains(nodeId)) {
                count++;
            }
        }
        return count;
    }

    private List<CacheKeyPlacementView> currentKeyPlacements(long now) {
        List<CacheKeyPlacementView> placements = new ArrayList<>();
        for (String key : distinctKeys()) {
            buildPlacement(key, now).ifPresent(placements::add);
        }
        placements.sort(Comparator.comparing(CacheKeyPlacementView::hitCount).reversed()
                .thenComparing(CacheKeyPlacementView::key));
        return placements;
    }

    private Optional<CacheKeyPlacementView> buildPlacement(String key, long now) {
        StoredEntry latest = findLatestCopy(key, now).orElse(null);
        if (latest == null) {
            return Optional.empty();
        }
        List<String> owners = ownersForKey(key, ring, nodes.keySet());
        String preferredPrimary = owners.isEmpty() ? null : owners.get(0);
        String activePrimary = firstAliveOwner(owners).orElse(null);
        int activeCopies = 0;
        long hitCount = 0;
        for (String owner : owners) {
            CacheNodeState node = nodes.get(owner);
            if (node.active) {
                StoredEntry entry = node.entries.get(key);
                if (entry != null && !entry.isExpired(now)) {
                    activeCopies++;
                    hitCount = Math.max(hitCount, entry.hitCount);
                }
            }
        }
        return Optional.of(new CacheKeyPlacementView(
                key,
                latest.value,
                latest.version,
                Instant.ofEpochMilli(latest.writtenAtMillis),
                Instant.ofEpochMilli(latest.expiresAtMillis),
                ttlRemainingSeconds(latest.expiresAtMillis, now),
                hitCount,
                preferredPrimary,
                activePrimary,
                owners.stream().skip(1).toList(),
                activeCopies,
                activePrimary != null && !Objects.equals(preferredPrimary, activePrimary)));
    }

    private List<CacheNodeView> nodeViews(long now) {
        List<CacheNodeView> views = new ArrayList<>();
        for (CacheNodeState node : nodes.values()) {
            int primaryKeys = 0;
            int replicaKeys = 0;
            int orphanKeys = 0;
            List<CacheNodeEntryView> entries = new ArrayList<>();
            for (StoredEntry entry : node.entries.values()) {
                if (entry.isExpired(now)) {
                    continue;
                }
                List<String> owners = ownersForKey(entry.key, ring, nodes.keySet());
                String role = "orphan";
                boolean stale = false;
                if (!owners.isEmpty()) {
                    String activePrimary = firstAliveOwner(owners).orElse(null);
                    StoredEntry latest = findLatestCopy(entry.key, now).orElse(entry);
                    stale = entry.version < latest.version;
                    if (owners.get(0).equals(node.nodeId)) {
                        role = Objects.equals(activePrimary, node.nodeId) ? "primary" : "failed-primary";
                    } else if (owners.contains(node.nodeId)) {
                        role = "replica";
                    }
                }
                switch (role) {
                    case "primary", "failed-primary" -> primaryKeys++;
                    case "replica" -> replicaKeys++;
                    default -> orphanKeys++;
                }
                entries.add(new CacheNodeEntryView(
                        entry.key,
                        entry.value,
                        entry.version,
                        role,
                        stale,
                        entry.hitCount,
                        Instant.ofEpochMilli(entry.writtenAtMillis),
                        Instant.ofEpochMilli(entry.expiresAtMillis)));
            }
            entries.sort(Comparator.comparing(CacheNodeEntryView::key));
            views.add(new CacheNodeView(
                    node.nodeId,
                    node.active,
                    primaryKeys,
                    replicaKeys,
                    orphanKeys,
                    entries.size(),
                    nodeCapacity,
                    node.hitsServed,
                    node.writesHandled,
                    node.evictions,
                    node.lastReplicationLagMillis,
                    entries));
        }
        return views;
    }

    private List<CacheShardView> shardViews() {
        List<CacheShardView> views = new ArrayList<>();
        for (int i = 0; i < 12; i++) {
            String partitionKey = "partition-" + i;
            List<String> owners = ownersForKey(partitionKey, ring, nodes.keySet());
            String preferredPrimary = owners.isEmpty() ? null : owners.get(0);
            String activePrimary = firstAliveOwner(owners).orElse(null);
            views.add(new CacheShardView(
                    partitionKey,
                    formatHash(hashValue(partitionKey)),
                    preferredPrimary,
                    activePrimary,
                    owners.stream().skip(1).toList()));
        }
        return views;
    }

    private Optional<CopyLocation> freshestActiveOwnerCopy(String key, List<String> owners, long now) {
        CopyLocation best = null;
        for (String ownerId : owners) {
            CacheNodeState node = nodes.get(ownerId);
            if (!node.active) {
                continue;
            }
            StoredEntry entry = node.entries.get(key);
            if (entry == null || entry.isExpired(now)) {
                continue;
            }
            if (best == null
                    || entry.version > best.entry.version
                    || (entry.version == best.entry.version && entry.writtenAtMillis > best.entry.writtenAtMillis)) {
                best = new CopyLocation(node, entry);
            }
        }
        return Optional.ofNullable(best);
    }

    private Optional<StoredEntry> findLatestCopy(String key, long now) {
        StoredEntry latest = null;
        for (CacheNodeState node : nodes.values()) {
            StoredEntry entry = node.entries.get(key);
            if (entry == null || entry.isExpired(now)) {
                continue;
            }
            if (latest == null
                    || entry.version > latest.version
                    || (entry.version == latest.version && entry.writtenAtMillis > latest.writtenAtMillis)) {
                latest = entry;
            }
        }
        return Optional.ofNullable(latest);
    }

    private void storeEntry(CacheNodeState node, StoredEntry candidate, boolean countWrite, long lagMillis) {
        StoredEntry existing = node.entries.get(candidate.key);
        long hits = existing == null ? candidate.hitCount : existing.hitCount;
        StoredEntry merged = new StoredEntry(
                candidate.key,
                candidate.value,
                candidate.version,
                candidate.writtenAtMillis,
                candidate.expiresAtMillis,
                hits);
        node.entries.put(candidate.key, merged);
        if (countWrite) {
            node.writesHandled++;
        }
        node.lastReplicationLagMillis = lagMillis;
        evictIfNeeded(node);
    }

    private void evictIfNeeded(CacheNodeState node) {
        while (node.entries.size() > nodeCapacity) {
            String evictedKey = node.entries.entrySet().iterator().next().getKey();
            node.entries.remove(evictedKey);
            node.evictions++;
            addEvent("eviction", "Node " + node.nodeId + " evicted " + evictedKey + " using LRU.");
        }
    }

    private void purgeExpired(long now) {
        for (CacheNodeState node : nodes.values()) {
            node.entries.entrySet().removeIf(entry -> entry.getValue().isExpired(now));
        }
    }

    private List<String> ownersForKey(String key, NavigableMap<Long, String> ringView, Set<String> physicalNodes) {
        if (ringView.isEmpty() || physicalNodes.isEmpty()) {
            return List.of();
        }
        int desired = Math.min(replicationFactor, physicalNodes.size());
        long hash = hashValue(key);
        LinkedHashSet<String> owners = new LinkedHashSet<>();
        collectOwners(hash, ringView, owners, desired);
        if (owners.size() < desired) {
            collectOwners(Long.MIN_VALUE, ringView, owners, desired);
        }
        return List.copyOf(owners);
    }

    private void collectOwners(long hash, NavigableMap<Long, String> ringView, LinkedHashSet<String> owners, int desired) {
        for (Map.Entry<Long, String> entry : ringView.tailMap(hash, true).entrySet()) {
            owners.add(entry.getValue());
            if (owners.size() == desired) {
                return;
            }
        }
        for (Map.Entry<Long, String> entry : ringView.headMap(hash, false).entrySet()) {
            owners.add(entry.getValue());
            if (owners.size() == desired) {
                return;
            }
        }
    }

    private Optional<String> firstAliveOwner(List<String> owners) {
        return owners.stream()
                .filter(owner -> {
                    CacheNodeState node = nodes.get(owner);
                    return node != null && node.active;
                })
                .findFirst();
    }

    private Map<String, Long> nodeHitCounters() {
        Map<String, Long> counters = new LinkedHashMap<>();
        for (Map.Entry<String, CacheNodeState> entry : nodes.entrySet()) {
            counters.put(entry.getKey(), entry.getValue().hitsServed);
        }
        return counters;
    }

    private Set<String> distinctKeys() {
        LinkedHashSet<String> keys = new LinkedHashSet<>();
        for (CacheNodeState node : nodes.values()) {
            keys.addAll(node.entries.keySet());
        }
        return keys;
    }

    private int effectiveReplicationFactor() {
        return Math.min(replicationFactor, nodes.size());
    }

    private long now() {
        return timeSource.getAsLong();
    }

    private String normalizeExistingNode(String nodeId) {
        String normalized = normalizeId(nodeId, "nodeId", 40);
        if (!nodes.containsKey(normalized)) {
            throw new IllegalArgumentException("Unknown node: " + normalized);
        }
        return normalized;
    }

    private String normalizeId(String value, String field, int maxLength) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(field + " is required.");
        }
        String normalized = value.trim();
        if (normalized.length() > maxLength) {
            throw new IllegalArgumentException(field + " must be <= " + maxLength + " characters.");
        }
        if (!ID_PATTERN.matcher(normalized).matches()) {
            throw new IllegalArgumentException(field + " must use letters, numbers, '.', '_', '-', ':' only.");
        }
        return normalized;
    }

    private String normalizeValue(String value) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException("value is required.");
        }
        String normalized = value.trim();
        if (normalized.length() > 256) {
            throw new IllegalArgumentException("value must be <= 256 characters.");
        }
        return normalized;
    }

    private int normalizeTtl(Integer ttlSeconds) {
        int resolved = ttlSeconds == null ? defaultTtlSeconds : ttlSeconds;
        if (resolved < 1 || resolved > maxTtlSeconds) {
            throw new IllegalArgumentException("ttlSeconds must be between 1 and " + maxTtlSeconds + ".");
        }
        return resolved;
    }

    private int normalizeRequestCount(Integer requests) {
        int resolved = requests == null ? 50 : requests;
        if (resolved < 1 || resolved > 500) {
            throw new IllegalArgumentException("requests must be between 1 and 500.");
        }
        return resolved;
    }

    private long hashValue(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("MD5");
            byte[] hashed = digest.digest(value.getBytes(StandardCharsets.UTF_8));
            return ByteBuffer.wrap(hashed).getLong();
        } catch (NoSuchAlgorithmException ex) {
            throw new IllegalStateException("MD5 hashing not available", ex);
        }
    }

    private String formatHash(long value) {
        String hex = Long.toUnsignedString(value, 16);
        StringBuilder padded = new StringBuilder("0x");
        for (int i = hex.length(); i < 16; i++) {
            padded.append('0');
        }
        padded.append(hex);
        return padded.toString();
    }

    private long ttlRemainingSeconds(long expiresAtMillis, long now) {
        return Math.max(0L, (expiresAtMillis - now + 999) / 1000);
    }

    private void addNodeInternal(String nodeId) {
        String normalized = normalizeId(nodeId, "nodeId", 40);
        if (nodeTokens.containsKey(normalized)) {
            throw new IllegalArgumentException("Duplicate node " + normalized);
        }
        List<Long> tokens = new ArrayList<>(virtualNodes);
        for (int i = 0; i < virtualNodes; i++) {
            long token = hashValue(normalized + "#" + i);
            tokens.add(token);
            ring.put(token, normalized);
        }
        nodeTokens.put(normalized, tokens);
        nodes.put(normalized, new CacheNodeState(normalized, nodeCapacity));
    }

    private void addEvent(String category, String message) {
        events.addFirst(new ClusterEvent(category, message, Instant.now()));
        while (events.size() > MAX_EVENT_COUNT) {
            events.removeLast();
        }
    }

    private static List<String> parseInitialNodes(String raw) {
        if (raw == null || raw.isBlank()) {
            return List.of();
        }
        List<String> nodes = new ArrayList<>();
        for (String value : raw.split(",")) {
            String trimmed = value.trim();
            if (!trimmed.isEmpty()) {
                nodes.add(trimmed);
            }
        }
        return nodes;
    }

    private static final class CacheNodeState {
        private final String nodeId;
        private final LinkedHashMap<String, StoredEntry> entries;
        private boolean active = true;
        private long hitsServed;
        private long writesHandled;
        private long evictions;
        private long lastReplicationLagMillis;

        private CacheNodeState(String nodeId, int capacityHint) {
            this.nodeId = nodeId;
            this.entries = new LinkedHashMap<>(capacityHint, 0.75f, true);
        }
    }

    private static final class StoredEntry {
        private final String key;
        private final String value;
        private final long version;
        private final long writtenAtMillis;
        private final long expiresAtMillis;
        private long hitCount;

        private StoredEntry(String key, String value, long version, long writtenAtMillis, long expiresAtMillis, long hitCount) {
            this.key = key;
            this.value = value;
            this.version = version;
            this.writtenAtMillis = writtenAtMillis;
            this.expiresAtMillis = expiresAtMillis;
            this.hitCount = hitCount;
        }

        private boolean isExpired(long now) {
            return now >= expiresAtMillis;
        }

        private StoredEntry copy() {
            return new StoredEntry(key, value, version, writtenAtMillis, expiresAtMillis, hitCount);
        }
    }

    private record CopyLocation(CacheNodeState node, StoredEntry entry) {
    }
}
