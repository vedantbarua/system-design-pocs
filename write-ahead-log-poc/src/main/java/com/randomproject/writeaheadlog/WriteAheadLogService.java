package com.randomproject.writeaheadlog;

import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Pattern;

@Service
public class WriteAheadLogService {
    private static final Pattern TOKEN_PATTERN = Pattern.compile("^[A-Za-z0-9._:-]+$");
    private static final int MAX_EVENTS = 18;
    private static final int MAX_LOG_ENTRIES = 60;

    private final Clock clock;
    private final Map<String, String> state = new LinkedHashMap<>();
    private final List<WalEntry> log = new ArrayList<>();
    private final Map<String, WalEntry> commandIndex = new LinkedHashMap<>();
    private final Deque<WalEvent> events = new ArrayDeque<>();

    private Checkpoint checkpoint = new Checkpoint(0, Instant.EPOCH, Map.of());
    private long nextLsn = 1;

    public WriteAheadLogService() {
        this(Clock.systemUTC(), true);
    }

    WriteAheadLogService(Clock clock) {
        this(clock, true);
    }

    WriteAheadLogService(Clock clock, boolean seedData) {
        this.clock = clock;
        if (seedData) {
            seed();
        }
    }

    public synchronized WalSnapshot snapshot() {
        return new WalSnapshot(
                Map.copyOf(state),
                List.copyOf(log),
                toCheckpointView(checkpoint),
                List.copyOf(events),
                commandIndex.size(),
                nextLsn);
    }

    public synchronized ApplyResult put(String commandId, String key, String value) {
        String normalizedCommandId = normalizeToken(commandId, "commandId");
        String normalizedKey = normalizeToken(key, "key");
        String normalizedValue = normalizeValue(value);
        Optional<WalEntry> duplicate = findDuplicate(normalizedCommandId);
        if (duplicate.isPresent()) {
            WalEntry entry = duplicate.get();
            addEvent("duplicate", "Ignored duplicate command " + normalizedCommandId + " already recorded at LSN " + entry.lsn() + ".");
            return new ApplyResult(true, "Duplicate command ignored.", entry, Map.copyOf(state));
        }
        WalEntry entry = append(normalizedCommandId, WalOperation.PUT, normalizedKey, normalizedValue);
        state.put(normalizedKey, normalizedValue);
        addEvent("apply", "Applied PUT " + normalizedKey + " at LSN " + entry.lsn() + ".");
        return new ApplyResult(false, "PUT appended and applied.", entry, Map.copyOf(state));
    }

    public synchronized ApplyResult delete(String commandId, String key) {
        String normalizedCommandId = normalizeToken(commandId, "commandId");
        String normalizedKey = normalizeToken(key, "key");
        Optional<WalEntry> duplicate = findDuplicate(normalizedCommandId);
        if (duplicate.isPresent()) {
            WalEntry entry = duplicate.get();
            addEvent("duplicate", "Ignored duplicate command " + normalizedCommandId + " already recorded at LSN " + entry.lsn() + ".");
            return new ApplyResult(true, "Duplicate command ignored.", entry, Map.copyOf(state));
        }
        WalEntry entry = append(normalizedCommandId, WalOperation.DELETE, normalizedKey, null);
        state.remove(normalizedKey);
        addEvent("apply", "Applied DELETE " + normalizedKey + " at LSN " + entry.lsn() + ".");
        return new ApplyResult(false, "DELETE appended and applied.", entry, Map.copyOf(state));
    }

    public synchronized CheckpointView createCheckpoint() {
        long checkpointLsn = log.stream().mapToLong(WalEntry::lsn).max().orElse(0);
        checkpoint = new Checkpoint(checkpointLsn, now(), new LinkedHashMap<>(state));
        addEvent("checkpoint", "Checkpoint captured state through LSN " + checkpointLsn + ".");
        return toCheckpointView(checkpoint);
    }

    public synchronized RecoveryResult simulateCrashAndRecover() {
        Map<String, String> recovered = new LinkedHashMap<>(checkpoint.state());
        int replayed = 0;
        for (WalEntry entry : log) {
            if (entry.lsn() <= checkpoint.lsn()) {
                continue;
            }
            applyTo(recovered, entry);
            replayed++;
        }
        state.clear();
        state.putAll(recovered);
        addEvent("recovery", "Recovered from checkpoint LSN " + checkpoint.lsn() + " and replayed " + replayed + " log entr" + (replayed == 1 ? "y." : "ies."));
        return new RecoveryResult(replayed, checkpoint.lsn(), Map.copyOf(state));
    }

    public synchronized WalSnapshot compactLog() {
        if (checkpoint.lsn() == 0) {
            throw new IllegalStateException("Create a checkpoint before compacting.");
        }
        log.removeIf(entry -> entry.lsn() <= checkpoint.lsn());
        addEvent("compact", "Compacted log through checkpoint LSN " + checkpoint.lsn() + "; retained " + log.size() + " entr" + (log.size() == 1 ? "y." : "ies."));
        return snapshot();
    }

    private WalEntry append(String commandId, WalOperation operation, String key, String value) {
        if (log.size() >= MAX_LOG_ENTRIES) {
            throw new IllegalStateException("WAL is full for the demo. Checkpoint and compact before writing more entries.");
        }
        WalEntry entry = new WalEntry(nextLsn++, commandId, operation, key, value, now());
        log.add(entry);
        commandIndex.put(commandId, entry);
        addEvent("append", "Appended " + operation + " for key " + key + " at LSN " + entry.lsn() + ".");
        return entry;
    }

    private Optional<WalEntry> findDuplicate(String commandId) {
        return Optional.ofNullable(commandIndex.get(commandId));
    }

    private void applyTo(Map<String, String> target, WalEntry entry) {
        if (entry.operation() == WalOperation.PUT) {
            target.put(entry.key(), entry.value());
        } else {
            target.remove(entry.key());
        }
    }

    private String normalizeToken(String value, String field) {
        String normalized = value == null ? "" : value.trim();
        if (normalized.isBlank()) {
            throw new IllegalArgumentException(field + " is required.");
        }
        if (normalized.length() > 80) {
            throw new IllegalArgumentException(field + " must be 80 characters or fewer.");
        }
        if (!TOKEN_PATTERN.matcher(normalized).matches()) {
            throw new IllegalArgumentException(field + " may only contain letters, numbers, dots, underscores, colons, and dashes.");
        }
        return normalized;
    }

    private String normalizeValue(String value) {
        String normalized = value == null ? "" : value.trim();
        if (normalized.isBlank()) {
            throw new IllegalArgumentException("value is required.");
        }
        if (normalized.length() > 240) {
            throw new IllegalArgumentException("value must be 240 characters or fewer.");
        }
        return normalized;
    }

    private CheckpointView toCheckpointView(Checkpoint checkpoint) {
        return new CheckpointView(checkpoint.lsn(), checkpoint.createdAt(), Map.copyOf(checkpoint.state()));
    }

    private void addEvent(String type, String message) {
        events.addFirst(new WalEvent(now(), type, message));
        while (events.size() > MAX_EVENTS) {
            events.removeLast();
        }
    }

    private Instant now() {
        return Instant.now(clock);
    }

    private void seed() {
        put("seed-001", "catalog:shard", "east-1");
        put("seed-002", "lease:owner", "worker-a");
        createCheckpoint();
        put("seed-003", "lease:owner", "worker-b");
        put("seed-004", "queue:cursor", "42");
    }

    private record Checkpoint(long lsn, Instant createdAt, Map<String, String> state) {
    }
}
