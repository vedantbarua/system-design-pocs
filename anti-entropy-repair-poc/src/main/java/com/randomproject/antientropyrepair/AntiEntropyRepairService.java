package com.randomproject.antientropyrepair;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.Deque;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.TreeMap;
import java.util.TreeSet;
import java.util.function.LongSupplier;
import java.util.regex.Pattern;

@Service
public class AntiEntropyRepairService {
    private static final Pattern ID_PATTERN = Pattern.compile("^[A-Za-z0-9._:-]+$");

    private final Map<String, ReplicaState> replicas = new LinkedHashMap<>();
    private final Deque<String> recentEvents = new ArrayDeque<>();
    private final int rangeSize;
    private final int historyLimit;
    private final LongSupplier timeSource;
    private RepairPlanView latestRepairPlan;
    private long versionSequence;

    @Autowired
    public AntiEntropyRepairService(
            @Value("${cluster.replicas:replica-a,replica-b,replica-c}") String replicaIds,
            @Value("${repair.range-size:4}") int rangeSize,
            @Value("${repair.history-limit:24}") int historyLimit) {
        this(parseReplicaIds(replicaIds), rangeSize, historyLimit, System::currentTimeMillis);
    }

    AntiEntropyRepairService(List<String> replicaIds, int rangeSize, int historyLimit, LongSupplier timeSource) {
        if (replicaIds == null || replicaIds.size() < 2) {
            throw new IllegalArgumentException("At least two replicas are required.");
        }
        this.rangeSize = Math.max(1, rangeSize);
        this.historyLimit = Math.max(6, historyLimit);
        this.timeSource = timeSource;
        for (String replicaId : replicaIds) {
            String normalized = normalizeId(replicaId, "replicaId", 40);
            replicas.put(normalized, new ReplicaState(normalized));
        }
        seedConsistentData();
        this.latestRepairPlan = buildRepairPlan();
        addEvent("Booted replicas " + String.join(", ", replicas.keySet()) + " with consistent seed data.");
    }

    public synchronized SystemSnapshot snapshot() {
        return toSnapshot();
    }

    public synchronized CommandResult write(WriteRequest request) {
        String key = normalizeId(request.key(), "key", 80);
        String value = normalizeValue(request.value());
        String skipReplicaId = normalizeOptionalId(request.skipReplicaId(), "skipReplicaId", 40);
        if (skipReplicaId != null) {
            requireReplica(skipReplicaId);
        }
        long version = nextVersion();
        int applied = 0;
        int skipped = 0;
        for (ReplicaState replica : replicas.values()) {
            if (replica.mode != ReplicaMode.HEALTHY || replica.replicaId.equals(skipReplicaId)) {
                skipped += 1;
                continue;
            }
            replica.entries.put(key, new StoredValue(value, version, "client", timeSource.getAsLong()));
            applied += 1;
        }
        latestRepairPlan = buildRepairPlan();
        addEvent("Wrote key " + key + " to " + applied + " healthy replicas; skipped " + skipped + ".");
        return new CommandResult("Write applied to " + applied + " replicas.", toSnapshot());
    }

    public synchronized CommandResult corrupt(CorruptRequest request) {
        String replicaId = normalizeId(request.replicaId(), "replicaId", 40);
        String key = normalizeId(request.key(), "key", 80);
        String value = normalizeValue(request.value());
        ReplicaState replica = requireReplica(replicaId);
        replica.entries.put(key, new StoredValue(value, nextVersion(), replicaId + "-corrupt", timeSource.getAsLong()));
        latestRepairPlan = buildRepairPlan();
        addEvent("Corrupted " + key + " on " + replicaId + ".");
        return new CommandResult("Corrupted " + key + " on " + replicaId + ".", toSnapshot());
    }

    public synchronized CommandResult deleteReplicaKey(DeleteReplicaKeyRequest request) {
        String replicaId = normalizeId(request.replicaId(), "replicaId", 40);
        String key = normalizeId(request.key(), "key", 80);
        ReplicaState replica = requireReplica(replicaId);
        boolean removed = replica.entries.remove(key) != null;
        latestRepairPlan = buildRepairPlan();
        addEvent((removed ? "Deleted " : "Did not find ") + key + " on " + replicaId + ".");
        return new CommandResult((removed ? "Deleted " : "No local copy for ") + key + " on " + replicaId + ".", toSnapshot());
    }

    public synchronized CommandResult setReplicaMode(ReplicaModeRequest request) {
        String replicaId = normalizeId(request.replicaId(), "replicaId", 40);
        ReplicaMode mode = request.mode() == null ? ReplicaMode.HEALTHY : request.mode();
        ReplicaState replica = requireReplica(replicaId);
        replica.mode = mode;
        latestRepairPlan = buildRepairPlan();
        addEvent("Set " + replicaId + " to " + mode + ".");
        return new CommandResult("Set " + replicaId + " to " + mode + ".", toSnapshot());
    }

    public synchronized CommandResult compare() {
        latestRepairPlan = buildRepairPlan();
        addEvent("Compared Merkle-style range hashes; divergent ranges=" + latestRepairPlan.divergentRanges() + ".");
        return new CommandResult("Compared replica range hashes.", toSnapshot());
    }

    public synchronized RepairResult repair(RepairRequest request) {
        String sourceReplicaId = normalizeOptionalId(request.sourceReplicaId(), "sourceReplicaId", 40);
        String targetReplicaId = normalizeOptionalId(request.targetReplicaId(), "targetReplicaId", 40);
        String rangeStart = normalizeOptionalId(request.rangeStart(), "rangeStart", 80);
        String rangeEnd = normalizeOptionalId(request.rangeEnd(), "rangeEnd", 80);
        if (sourceReplicaId != null) {
            requireHealthyReplica(sourceReplicaId);
        }
        if (targetReplicaId != null) {
            requireHealthyReplica(targetReplicaId);
        }

        RepairPlanView plan = buildRepairPlan();
        Set<String> candidateKeys = new TreeSet<>();
        for (RangeDiffView range : plan.ranges()) {
            if (!range.consistent() && rangeMatches(range, rangeStart, rangeEnd)) {
                candidateKeys.addAll(range.divergentKeys());
            }
        }

        List<ReplicaState> targets = targetReplicaId == null
                ? replicas.values().stream().filter(replica -> replica.mode == ReplicaMode.HEALTHY).toList()
                : List.of(replicas.get(targetReplicaId));

        List<String> repairedKeys = new ArrayList<>();
        for (String key : candidateKeys) {
            Optional<StoredValue> canonical = sourceReplicaId == null
                    ? newestVisibleValue(key)
                    : Optional.ofNullable(replicas.get(sourceReplicaId).entries.get(key));
            if (canonical.isEmpty()) {
                continue;
            }
            for (ReplicaState target : targets) {
                if (sourceReplicaId != null && target.replicaId.equals(sourceReplicaId)) {
                    continue;
                }
                StoredValue existing = target.entries.get(key);
                if (!Objects.equals(existing, canonical.get())) {
                    target.entries.put(key, canonical.get().copy());
                    repairedKeys.add(target.replicaId + ":" + key);
                }
            }
        }

        latestRepairPlan = buildRepairPlan();
        addEvent("Repaired " + repairedKeys.size() + " replica-key copies across " + candidateKeys.size() + " divergent keys.");
        return new RepairResult("Repaired " + repairedKeys.size() + " replica-key copies.", repairedKeys.size(), repairedKeys, toSnapshot());
    }

    private RepairPlanView buildRepairPlan() {
        List<String> keys = allKeys();
        List<RangeDiffView> ranges = new ArrayList<>();
        int divergentRanges = 0;
        Set<String> divergentKeys = new TreeSet<>();

        if (keys.isEmpty()) {
            return new RepairPlanView(true, 0, 0, 0, List.of());
        }

        for (int start = 0; start < keys.size(); start += rangeSize) {
            List<String> rangeKeys = keys.subList(start, Math.min(start + rangeSize, keys.size()));
            String rangeStart = rangeKeys.get(0);
            String rangeEnd = rangeKeys.get(rangeKeys.size() - 1);
            List<RangeHashView> hashes = replicas.values().stream()
                    .map(replica -> rangeHash(replica, rangeStart, rangeEnd))
                    .toList();
            boolean consistent = hashes.stream().map(RangeHashView::hash).distinct().count() == 1;
            List<String> rangeDivergentKeys = divergentKeysInRange(rangeStart, rangeEnd);
            if (!consistent) {
                divergentRanges += 1;
                divergentKeys.addAll(rangeDivergentKeys);
            }
            ranges.add(new RangeDiffView(rangeStart, rangeEnd, consistent, hashes, rangeDivergentKeys));
        }

        return new RepairPlanView(divergentRanges == 0, ranges.size(), divergentRanges, divergentKeys.size(), ranges);
    }

    private RangeHashView rangeHash(ReplicaState replica, String rangeStart, String rangeEnd) {
        if (replica.mode == ReplicaMode.DOWN) {
            return new RangeHashView(replica.replicaId, rangeStart, rangeEnd, 0, "DOWN");
        }
        StringBuilder builder = new StringBuilder();
        int keyCount = 0;
        for (Map.Entry<String, StoredValue> entry : replica.entries.subMap(rangeStart, true, rangeEnd, true).entrySet()) {
            keyCount += 1;
            builder.append(entry.getKey()).append('=')
                    .append(entry.getValue().value).append('@')
                    .append(entry.getValue().version).append(';');
        }
        return new RangeHashView(replica.replicaId, rangeStart, rangeEnd, keyCount, shortHash(builder.toString()));
    }

    private List<String> divergentKeysInRange(String rangeStart, String rangeEnd) {
        return allKeys().stream()
                .filter(key -> key.compareTo(rangeStart) >= 0 && key.compareTo(rangeEnd) <= 0)
                .filter(key -> !keyConsistent(key))
                .toList();
    }

    private boolean keyConsistent(String key) {
        Set<String> signatures = new LinkedHashSet<>();
        for (ReplicaState replica : replicas.values()) {
            if (replica.mode == ReplicaMode.DOWN) {
                signatures.add(replica.replicaId + ":DOWN");
                continue;
            }
            StoredValue value = replica.entries.get(key);
            signatures.add(value == null ? "MISSING" : value.signature());
        }
        return signatures.size() == 1;
    }

    private Optional<StoredValue> newestVisibleValue(String key) {
        return replicas.values().stream()
                .filter(replica -> replica.mode == ReplicaMode.HEALTHY)
                .map(replica -> replica.entries.get(key))
                .filter(Objects::nonNull)
                .max(Comparator.comparingLong(value -> value.version));
    }

    private SystemSnapshot toSnapshot() {
        RepairPlanView plan = latestRepairPlan == null ? buildRepairPlan() : latestRepairPlan;
        List<String> keys = allKeys();
        int consistentKeys = (int) keys.stream().filter(this::keyConsistent).count();
        int divergentKeys = Math.max(0, keys.size() - consistentKeys);
        int percent = keys.isEmpty() ? 100 : (int) Math.round((consistentKeys * 100.0) / keys.size());
        int healthy = (int) replicas.values().stream().filter(replica -> replica.mode == ReplicaMode.HEALTHY).count();
        return new SystemSnapshot(
                replicas.size(),
                healthy,
                keys.size(),
                consistentKeys,
                divergentKeys,
                percent,
                plan,
                replicas.values().stream().map(this::toReplicaView).toList(),
                List.copyOf(recentEvents));
    }

    private ReplicaView toReplicaView(ReplicaState replica) {
        return new ReplicaView(
                replica.replicaId,
                replica.mode,
                replica.entries.size(),
                replica.mode == ReplicaMode.DOWN ? "DOWN" : shortHash(replica.entries.toString()),
                replica.entries.entrySet().stream()
                        .map(entry -> new KeyValueView(entry.getKey(), entry.getValue().value, entry.getValue().version, entry.getValue().writerReplicaId))
                        .toList());
    }

    private boolean rangeMatches(RangeDiffView range, String rangeStart, String rangeEnd) {
        if (rangeStart == null && rangeEnd == null) {
            return true;
        }
        String requestedStart = rangeStart == null ? range.rangeStart() : rangeStart;
        String requestedEnd = rangeEnd == null ? range.rangeEnd() : rangeEnd;
        return range.rangeStart().compareTo(requestedEnd) <= 0 && range.rangeEnd().compareTo(requestedStart) >= 0;
    }

    private List<String> allKeys() {
        TreeSet<String> keys = new TreeSet<>();
        for (ReplicaState replica : replicas.values()) {
            if (replica.mode != ReplicaMode.DOWN) {
                keys.addAll(replica.entries.keySet());
            }
        }
        return List.copyOf(keys);
    }

    private ReplicaState requireReplica(String replicaId) {
        ReplicaState replica = replicas.get(replicaId);
        if (replica == null) {
            throw new IllegalArgumentException("Unknown replica: " + replicaId);
        }
        return replica;
    }

    private ReplicaState requireHealthyReplica(String replicaId) {
        ReplicaState replica = requireReplica(replicaId);
        if (replica.mode != ReplicaMode.HEALTHY) {
            throw new IllegalArgumentException("Replica " + replicaId + " must be HEALTHY.");
        }
        return replica;
    }

    private void seedConsistentData() {
        putSeed("cart:1001", "keyboard=1,mouse=1");
        putSeed("cart:1002", "monitor=2");
        putSeed("cart:1003", "dock=1");
        putSeed("cart:1004", "cable=3");
        putSeed("profile:42", "tier=gold");
        putSeed("profile:73", "tier=silver");
        putSeed("session:abc", "active");
        putSeed("session:def", "active");
    }

    private void putSeed(String key, String value) {
        long version = nextVersion();
        for (ReplicaState replica : replicas.values()) {
            replica.entries.put(key, new StoredValue(value, version, "seed", timeSource.getAsLong()));
        }
    }

    private long nextVersion() {
        versionSequence += 1;
        return versionSequence;
    }

    private void addEvent(String message) {
        recentEvents.addFirst(message);
        while (recentEvents.size() > historyLimit) {
            recentEvents.removeLast();
        }
    }

    private static String normalizeId(String value, String fieldName, int maxLength) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(fieldName + " is required.");
        }
        String normalized = value.trim();
        if (normalized.length() > maxLength || !ID_PATTERN.matcher(normalized).matches()) {
            throw new IllegalArgumentException(fieldName + " must use letters, numbers, dot, underscore, colon, or dash.");
        }
        return normalized;
    }

    private static String normalizeOptionalId(String value, String fieldName, int maxLength) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return normalizeId(value, fieldName, maxLength);
    }

    private static String normalizeValue(String value) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException("value is required.");
        }
        String normalized = value.trim();
        if (normalized.length() > 180) {
            throw new IllegalArgumentException("value must be at most 180 characters.");
        }
        return normalized;
    }

    private static List<String> parseReplicaIds(String replicaIds) {
        return List.of(replicaIds.split(",")).stream()
                .map(String::trim)
                .filter(value -> !value.isBlank())
                .toList();
    }

    private static String shortHash(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder builder = new StringBuilder();
            for (int i = 0; i < Math.min(6, hash.length); i++) {
                builder.append(String.format("%02x", hash[i]));
            }
            return builder.toString();
        } catch (NoSuchAlgorithmException ex) {
            throw new IllegalStateException("SHA-256 is not available.", ex);
        }
    }

    private static final class ReplicaState {
        private final String replicaId;
        private final TreeMap<String, StoredValue> entries = new TreeMap<>();
        private ReplicaMode mode = ReplicaMode.HEALTHY;

        private ReplicaState(String replicaId) {
            this.replicaId = replicaId;
        }
    }

    private static final class StoredValue {
        private final String value;
        private final long version;
        private final String writerReplicaId;
        private final long updatedAt;

        private StoredValue(String value, long version, String writerReplicaId, long updatedAt) {
            this.value = value;
            this.version = version;
            this.writerReplicaId = writerReplicaId;
            this.updatedAt = updatedAt;
        }

        private String signature() {
            return value + "@" + version;
        }

        private StoredValue copy() {
            return new StoredValue(value, version, writerReplicaId, updatedAt);
        }

        @Override
        public boolean equals(Object other) {
            if (this == other) {
                return true;
            }
            if (!(other instanceof StoredValue that)) {
                return false;
            }
            return version == that.version && Objects.equals(value, that.value);
        }

        @Override
        public int hashCode() {
            return Objects.hash(value, version);
        }

        @Override
        public String toString() {
            return value + "@" + version;
        }
    }
}
