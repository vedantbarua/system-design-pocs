package com.randomproject.databasereplicationquorum;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.Deque;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.regex.Pattern;

@Service
public class QuorumReplicationService {
    private static final Pattern KEY_PATTERN = Pattern.compile("^[A-Za-z0-9._:-]+$");

    private final Map<String, ReplicaNode> replicas = new LinkedHashMap<>();
    private final Deque<OperationEventView> recentEvents = new ArrayDeque<>();
    private final int historyLimit;
    private final int defaultReadQuorum;
    private final int defaultWriteQuorum;

    private long logicalClock = 0L;

    @Autowired
    public QuorumReplicationService(
            @Value("${cluster.replica-count:3}") int replicaCount,
            @Value("${cluster.default-read-quorum:2}") int defaultReadQuorum,
            @Value("${cluster.default-write-quorum:2}") int defaultWriteQuorum,
            @Value("${cluster.history-limit:18}") int historyLimit) {
        if (replicaCount < 3) {
            throw new IllegalArgumentException("replica-count must be at least 3.");
        }
        if (defaultReadQuorum < 1 || defaultReadQuorum > replicaCount) {
            throw new IllegalArgumentException("default-read-quorum must be between 1 and replica-count.");
        }
        if (defaultWriteQuorum < 1 || defaultWriteQuorum > replicaCount) {
            throw new IllegalArgumentException("default-write-quorum must be between 1 and replica-count.");
        }
        this.historyLimit = Math.max(1, historyLimit);
        this.defaultReadQuorum = defaultReadQuorum;
        this.defaultWriteQuorum = defaultWriteQuorum;
        for (int i = 0; i < replicaCount; i++) {
            String replicaId = "replica-" + (char) ('a' + i);
            replicas.put(replicaId, new ReplicaNode(replicaId));
        }
    }

    public synchronized ClusterConfigView configSnapshot() {
        return new ClusterConfigView(replicas.size(), defaultReadQuorum, defaultWriteQuorum, historyLimit);
    }

    public synchronized ClusterSnapshotView snapshot() {
        List<ReplicaView> replicaViews = replicas.values().stream()
                .map(this::toReplicaView)
                .toList();

        List<KeyStateView> keys = allKnownKeys().stream()
                .map(this::toKeyStateView)
                .toList();

        int healthy = 0;
        int lagging = 0;
        int down = 0;
        int pending = 0;
        for (ReplicaNode replica : replicas.values()) {
            pending += replica.pending.size();
            switch (replica.mode) {
                case HEALTHY -> healthy++;
                case LAGGING -> lagging++;
                case DOWN -> down++;
            }
        }

        return new ClusterSnapshotView(
                configSnapshot(),
                new ClusterMetricsView(
                        healthy,
                        lagging,
                        down,
                        keys.size(),
                        pending,
                        logicalClock),
                replicaViews,
                keys,
                List.copyOf(recentEvents));
    }

    public synchronized WriteResultView write(String key, String value, Integer requestedWriteQuorum) {
        String normalizedKey = normalizeKey(key);
        String normalizedValue = normalizeValue(value);
        int writeQuorum = normalizeQuorum(requestedWriteQuorum, defaultWriteQuorum, "writeQuorum");
        long version = ++logicalClock;
        Instant now = Instant.now();
        String coordinatorReplica = coordinatorReplicaId();

        VersionedValue candidate = new VersionedValue(normalizedKey, normalizedValue, version, now, coordinatorReplica);
        List<String> appliedReplicas = new ArrayList<>();
        List<String> queuedReplicas = new ArrayList<>();
        List<String> missedReplicas = new ArrayList<>();

        for (ReplicaNode replica : replicas.values()) {
            switch (replica.mode) {
                case HEALTHY -> {
                    replica.store.put(normalizedKey, candidate);
                    appliedReplicas.add(replica.replicaId);
                }
                case LAGGING -> {
                    enqueuePending(replica, candidate, "replication-lag");
                    queuedReplicas.add(replica.replicaId);
                }
                case DOWN -> {
                    enqueuePending(replica, candidate, "hinted-handoff");
                    missedReplicas.add(replica.replicaId);
                }
            }
        }

        boolean quorumSatisfied = appliedReplicas.size() >= writeQuorum;
        String message = quorumSatisfied
                ? "Committed version " + version + " for key " + normalizedKey + " with "
                + appliedReplicas.size() + "/" + replicas.size() + " immediate acknowledgements."
                : "Write quorum failed for key " + normalizedKey + ": required " + writeQuorum
                + " acknowledgements but only " + appliedReplicas.size() + " replica(s) applied immediately.";

        OperationEventView event = new OperationEventView(
                "WRITE",
                quorumSatisfied ? "QUORUM_OK" : "QUORUM_FAILED",
                normalizedKey,
                message,
                now);
        rememberEvent(event);

        return new WriteResultView(
                normalizedKey,
                normalizedValue,
                version,
                writeQuorum,
                appliedReplicas.size(),
                quorumSatisfied,
                appliedReplicas,
                queuedReplicas,
                missedReplicas,
                message,
                now);
    }

    public synchronized ReadResultView read(String key, Integer requestedReadQuorum, boolean repairOnRead) {
        String normalizedKey = normalizeKey(key);
        int readQuorum = normalizeQuorum(requestedReadQuorum, defaultReadQuorum, "readQuorum");
        List<ReplicaNode> availableReplicas = replicas.values().stream()
                .filter(replica -> replica.mode != ReplicaMode.DOWN)
                .toList();
        Instant now = Instant.now();

        if (availableReplicas.size() < readQuorum) {
            String message = "Read quorum failed for key " + normalizedKey + ": only " + availableReplicas.size()
                    + " replica(s) are reachable.";
            rememberEvent(new OperationEventView("READ", "QUORUM_FAILED", normalizedKey, message, now));
            return new ReadResultView(
                    normalizedKey,
                    readQuorum,
                    availableReplicas.size(),
                    false,
                    false,
                    null,
                    null,
                    false,
                    availableReplicas.stream().map(replica -> replica.replicaId).toList(),
                    List.of(),
                    0,
                    message,
                    now);
        }

        List<ReplicaNode> contactedReplicas = availableReplicas.subList(0, readQuorum);
        VersionedValue winner = null;
        List<String> staleReplicaIds = new ArrayList<>();

        for (ReplicaNode replica : contactedReplicas) {
            VersionedValue candidate = replica.store.get(normalizedKey);
            if (candidate != null && (winner == null || candidate.version > winner.version)) {
                winner = candidate;
            }
        }

        if (winner != null) {
            for (ReplicaNode replica : contactedReplicas) {
                VersionedValue current = replica.store.get(normalizedKey);
                if (current == null || current.version < winner.version) {
                    staleReplicaIds.add(replica.replicaId);
                }
            }
        }

        int repairedReplicas = 0;
        if (winner != null && repairOnRead && !staleReplicaIds.isEmpty()) {
            for (ReplicaNode replica : contactedReplicas) {
                VersionedValue current = replica.store.get(normalizedKey);
                if (current == null || current.version < winner.version) {
                    replica.store.put(normalizedKey, winner);
                    clearPendingForKey(replica, normalizedKey, winner.version);
                    repairedReplicas++;
                }
            }
        }

        boolean valueFound = winner != null;
        boolean staleObserved = !staleReplicaIds.isEmpty();
        String message;
        if (!valueFound) {
            message = "Read quorum succeeded but key " + normalizedKey + " was absent on all contacted replicas.";
        } else if (staleObserved) {
            message = "Read quorum returned version " + winner.version + " for key " + normalizedKey
                    + " while observing stale replica(s): " + String.join(", ", staleReplicaIds) + ".";
        } else {
            message = "Read quorum returned the latest visible value for key " + normalizedKey + ".";
        }
        if (repairOnRead && repairedReplicas > 0) {
            message += " Read repair updated " + repairedReplicas + " replica(s).";
        }

        rememberEvent(new OperationEventView("READ", "QUORUM_OK", normalizedKey, message, now));
        return new ReadResultView(
                normalizedKey,
                readQuorum,
                contactedReplicas.size(),
                true,
                valueFound,
                valueFound ? winner.value : null,
                valueFound ? winner.version : null,
                staleObserved,
                contactedReplicas.stream().map(replica -> replica.replicaId).toList(),
                staleReplicaIds,
                repairedReplicas,
                message,
                now);
    }

    public synchronized OperationEventView updateReplicaMode(String replicaId, String mode) {
        ReplicaNode replica = requireReplica(replicaId);
        ReplicaMode newMode = ReplicaMode.valueOf(mode.trim().toUpperCase(Locale.ROOT));
        replica.mode = newMode;
        String detail = "Replica " + replica.replicaId + " switched to " + newMode + ".";
        OperationEventView event = new OperationEventView("REPLICA_MODE", "UPDATED", null, detail, Instant.now());
        rememberEvent(event);
        return event;
    }

    public synchronized OperationEventView drainPending(String replicaId) {
        ReplicaNode replica = requireReplica(replicaId);
        if (replica.mode == ReplicaMode.DOWN) {
            throw new IllegalArgumentException("Cannot drain a replica while it is DOWN.");
        }

        int applied = 0;
        List<PendingReplication> work = new ArrayList<>(replica.pending);
        replica.pending.clear();
        for (PendingReplication pending : work) {
            VersionedValue current = replica.store.get(pending.value.key);
            if (current == null || current.version < pending.value.version) {
                replica.store.put(pending.value.key, pending.value);
                applied++;
            }
        }

        OperationEventView event = new OperationEventView(
                "DRAIN",
                "APPLIED",
                null,
                "Applied " + applied + " pending replication(s) to " + replica.replicaId + ".",
                Instant.now());
        rememberEvent(event);
        return event;
    }

    public synchronized OperationEventView repairKey(String key) {
        String normalizedKey = normalizeKey(key);
        VersionedValue winner = latestValueForKey(normalizedKey);
        if (winner == null) {
            throw new IllegalArgumentException("No replica currently stores key " + normalizedKey + ".");
        }

        int repaired = 0;
        for (ReplicaNode replica : replicas.values()) {
            if (replica.mode == ReplicaMode.DOWN) {
                enqueuePending(replica, winner, "repair-handoff");
                continue;
            }
            VersionedValue current = replica.store.get(normalizedKey);
            if (current == null || current.version < winner.version) {
                replica.store.put(normalizedKey, winner);
                repaired++;
            }
            clearPendingForKey(replica, normalizedKey, winner.version);
        }

        OperationEventView event = new OperationEventView(
                "REPAIR_KEY",
                "COMPLETED",
                normalizedKey,
                "Reconciled key " + normalizedKey + " to version " + winner.version + " across reachable replicas; repaired "
                        + repaired + " replica(s).",
                Instant.now());
        rememberEvent(event);
        return event;
    }

    public synchronized OperationEventView repairAll() {
        int repairedKeys = 0;
        for (String key : allKnownKeys()) {
            VersionedValue winner = latestValueForKey(key);
            if (winner == null) {
                continue;
            }
            boolean keyChanged = false;
            for (ReplicaNode replica : replicas.values()) {
                if (replica.mode == ReplicaMode.DOWN) {
                    enqueuePending(replica, winner, "repair-handoff");
                    continue;
                }
                VersionedValue current = replica.store.get(key);
                if (current == null || current.version < winner.version) {
                    replica.store.put(key, winner);
                    keyChanged = true;
                }
                clearPendingForKey(replica, key, winner.version);
            }
            if (keyChanged) {
                repairedKeys++;
            }
        }

        OperationEventView event = new OperationEventView(
                "REPAIR_ALL",
                "COMPLETED",
                null,
                "Repaired " + repairedKeys + " key(s) across reachable replicas.",
                Instant.now());
        rememberEvent(event);
        return event;
    }

    private void enqueuePending(ReplicaNode replica, VersionedValue candidate, String reason) {
        replica.pending.removeIf(existing -> existing.value.key.equals(candidate.key) && existing.value.version <= candidate.version);
        replica.pending.add(new PendingReplication(candidate, reason, Instant.now()));
    }

    private void clearPendingForKey(ReplicaNode replica, String key, long upToVersion) {
        replica.pending.removeIf(pending -> pending.value.key.equals(key) && pending.value.version <= upToVersion);
    }

    private ReplicaView toReplicaView(ReplicaNode replica) {
        List<ReplicaValueView> values = replica.store.values().stream()
                .sorted(Comparator.comparing(value -> value.key))
                .map(value -> new ReplicaValueView(value.key, value.value, value.version, value.committedAt, value.coordinatorReplica))
                .toList();
        List<PendingReplicationView> pending = replica.pending.stream()
                .sorted(Comparator.comparing(pendingValue -> pendingValue.value.key))
                .map(item -> new PendingReplicationView(
                        item.value.key,
                        item.value.value,
                        item.value.version,
                        item.reason,
                        item.queuedAt))
                .toList();
        long highestVersion = replica.store.values().stream().mapToLong(value -> value.version).max().orElse(0L);
        return new ReplicaView(replica.replicaId, replica.mode.name(), values.size(), pending.size(), highestVersion, values, pending);
    }

    private KeyStateView toKeyStateView(String key) {
        VersionedValue winner = latestValueForKey(key);
        List<KeyReplicaStateView> states = replicas.values().stream()
                .map(replica -> {
                    VersionedValue value = replica.store.get(key);
                    boolean latest = winner != null && value != null && value.version == winner.version;
                    return new KeyReplicaStateView(
                            replica.replicaId,
                            replica.mode.name(),
                            value == null ? null : value.version,
                            value == null ? null : value.value,
                            latest);
                })
                .toList();
        return new KeyStateView(key, winner == null ? null : winner.version, winner == null ? null : winner.value, states);
    }

    private VersionedValue latestValueForKey(String key) {
        VersionedValue winner = null;
        for (ReplicaNode replica : replicas.values()) {
            VersionedValue candidate = replica.store.get(key);
            if (candidate != null && (winner == null || candidate.version > winner.version)) {
                winner = candidate;
            }
        }
        return winner;
    }

    private List<String> allKnownKeys() {
        Set<String> keys = new LinkedHashSet<>();
        for (ReplicaNode replica : replicas.values()) {
            keys.addAll(replica.store.keySet());
            for (PendingReplication pending : replica.pending) {
                keys.add(pending.value.key);
            }
        }
        return keys.stream().sorted().toList();
    }

    private ReplicaNode requireReplica(String replicaId) {
        if (replicaId == null || replicaId.isBlank()) {
            throw new IllegalArgumentException("replicaId is required.");
        }
        ReplicaNode replica = replicas.get(replicaId.trim());
        if (replica == null) {
            throw new IllegalArgumentException("Unknown replica " + replicaId + ".");
        }
        return replica;
    }

    private String coordinatorReplicaId() {
        return replicas.keySet().iterator().next();
    }

    private int normalizeQuorum(Integer quorum, int defaultValue, String fieldName) {
        int normalized = quorum == null ? defaultValue : quorum;
        if (normalized < 1 || normalized > replicas.size()) {
            throw new IllegalArgumentException(fieldName + " must be between 1 and " + replicas.size() + ".");
        }
        return normalized;
    }

    private String normalizeKey(String key) {
        if (key == null || key.isBlank()) {
            throw new IllegalArgumentException("key is required.");
        }
        String normalized = key.trim();
        if (!KEY_PATTERN.matcher(normalized).matches()) {
            throw new IllegalArgumentException("key must match " + KEY_PATTERN.pattern() + ".");
        }
        return normalized;
    }

    private String normalizeValue(String value) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException("value is required.");
        }
        return value.trim();
    }

    private void rememberEvent(OperationEventView event) {
        recentEvents.addFirst(event);
        while (recentEvents.size() > historyLimit) {
            recentEvents.removeLast();
        }
    }

    private static final class ReplicaNode {
        private final String replicaId;
        private ReplicaMode mode = ReplicaMode.HEALTHY;
        private final Map<String, VersionedValue> store = new LinkedHashMap<>();
        private final List<PendingReplication> pending = new ArrayList<>();

        private ReplicaNode(String replicaId) {
            this.replicaId = replicaId;
        }
    }

    private enum ReplicaMode {
        HEALTHY,
        LAGGING,
        DOWN
    }

    private static final class VersionedValue {
        private final String key;
        private final String value;
        private final long version;
        private final Instant committedAt;
        private final String coordinatorReplica;

        private VersionedValue(String key, String value, long version, Instant committedAt, String coordinatorReplica) {
            this.key = key;
            this.value = value;
            this.version = version;
            this.committedAt = committedAt;
            this.coordinatorReplica = coordinatorReplica;
        }
    }

    private static final class PendingReplication {
        private final VersionedValue value;
        private final String reason;
        private final Instant queuedAt;

        private PendingReplication(VersionedValue value, String reason, Instant queuedAt) {
            this.value = Objects.requireNonNull(value);
            this.reason = Objects.requireNonNull(reason);
            this.queuedAt = Objects.requireNonNull(queuedAt);
        }
    }
}
