package com.randomproject.featureflag;

import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.Deque;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.function.LongSupplier;
import java.util.zip.CRC32;

@Service
public class FeatureFlagService {
    private static final int MAX_RECENT_CHANGES = 50;
    private static final int MAX_RULES_PER_DEFINITION = 12;

    private final Map<String, DefinitionState> definitions = new LinkedHashMap<>();
    private final Map<String, ClientState> clients = new LinkedHashMap<>();
    private final Deque<ChangeEventState> changes = new ArrayDeque<>();
    private final LongSupplier timeSource;
    private long currentVersion = 0L;

    public FeatureFlagService() {
        this(System::currentTimeMillis);
    }

    FeatureFlagService(LongSupplier timeSource) {
        this.timeSource = timeSource;
    }

    public synchronized ServiceSnapshot snapshot() {
        return new ServiceSnapshot(
                currentVersion,
                definitions.size(),
                clients.size(),
                changes.size(),
                definitions.values().stream()
                        .sorted(Comparator.comparing(definition -> definition.key))
                        .map(this::toDefinitionView)
                        .toList(),
                clients.values().stream()
                        .sorted(Comparator.comparing(client -> client.clientId))
                        .map(this::toClientStateView)
                        .toList(),
                changes.stream().map(this::toChangeEventView).toList());
    }

    public synchronized DefinitionView upsertDefinition(UpsertDefinitionRequest request) {
        String key = normalizeKey(request.key());
        validateRules(request.rules());
        long now = now();
        long version = nextVersion();
        DefinitionState state = new DefinitionState(
                key,
                request.type(),
                request.defaultValue().deepCopy(),
                normalizeText(request.description()),
                normalizeText(request.owner()),
                version,
                now,
                buildRules(request.rules()));
        definitions.put(key, state);
        addChange("UPSERT", key, "Published " + request.type().name().toLowerCase() + " " + key + ".", version, now);
        return toDefinitionView(state);
    }

    public synchronized DeleteResult deleteDefinition(String rawKey) {
        String key = normalizeKey(rawKey);
        DefinitionState removed = definitions.remove(key);
        if (removed == null) {
            throw new IllegalArgumentException("Definition " + key + " does not exist.");
        }
        long now = now();
        long version = nextVersion();
        addChange("DELETE", key, "Deleted definition " + key + ".", version, now);
        return new DeleteResult(key, version);
    }

    public synchronized EvaluationResult evaluate(EvaluateRequest request) {
        DefinitionState definition = requireDefinition(request.key());
        String subjectKey = normalizeSubjectKey(request.subjectKey());
        Map<String, String> attributes = normalizeAttributes(request.attributes());
        long now = now();
        for (RuleState rule : definition.rules) {
            if (!matches(rule, attributes)) {
                continue;
            }
            if (!passesRollout(definition.key, rule, subjectKey)) {
                continue;
            }
            return new EvaluationResult(
                    definition.key,
                    definition.type,
                    rule.value.deepCopy(),
                    definition.version,
                    "rule",
                    rule.name,
                    true,
                    Instant.ofEpochMilli(now));
        }
        return new EvaluationResult(
                definition.key,
                definition.type,
                definition.defaultValue.deepCopy(),
                definition.version,
                "default",
                null,
                true,
                Instant.ofEpochMilli(now));
    }

    public synchronized ClientSyncResponse syncClient(String clientId, Long lastKnownVersion) {
        String normalizedClientId = normalizeClientId(clientId);
        ClientState client = clients.computeIfAbsent(normalizedClientId, ClientState::new);
        long requestedVersion = lastKnownVersion == null ? client.cachedVersion : Math.max(0L, lastKnownVersion);
        boolean fullSnapshot = requestedVersion == 0L || changes.isEmpty() || requestedVersion < oldestVersionInLog();

        List<DefinitionState> upserts = new ArrayList<>();
        List<String> removedKeys = new ArrayList<>();
        if (requestedVersion < currentVersion) {
            if (fullSnapshot) {
                upserts.addAll(definitions.values());
            }
        }

        if (!fullSnapshot && requestedVersion < currentVersion) {
            collectIncrementalChanges(requestedVersion, upserts, removedKeys);
        }

        if (fullSnapshot) {
            removedKeys.clear();
            client.cache.clear();
        }

        for (DefinitionState definition : upserts) {
            client.cache.put(definition.key, new ClientCacheEntry(
                    definition.key,
                    definition.type,
                    definition.version,
                    definition.defaultValue.deepCopy(),
                    definition.rules.size(),
                    now()));
        }
        for (String removedKey : removedKeys) {
            client.cache.remove(removedKey);
        }
        client.cachedVersion = currentVersion;
        client.lastSyncAtMillis = now();

        return new ClientSyncResponse(
                client.clientId,
                currentVersion,
                fullSnapshot,
                upserts.stream().map(this::toDefinitionView).toList(),
                List.copyOf(removedKeys),
                client.cache.values().stream().map(this::toClientCacheEntryView).toList(),
                Instant.ofEpochMilli(client.lastSyncAtMillis));
    }

    private void collectIncrementalChanges(long requestedVersion, List<DefinitionState> upserts, List<String> removedKeys) {
        Map<String, ChangeEventState> latestByKey = new LinkedHashMap<>();
        List<ChangeEventState> ordered = changes.stream()
                .filter(change -> change.version > requestedVersion)
                .sorted(Comparator.comparingLong(change -> change.version))
                .toList();
        for (ChangeEventState change : ordered) {
            latestByKey.put(change.key, change);
        }
        for (ChangeEventState change : latestByKey.values()) {
            if ("DELETE".equals(change.action)) {
                removedKeys.add(change.key);
                continue;
            }
            DefinitionState definition = definitions.get(change.key);
            if (definition != null) {
                upserts.add(definition);
            }
        }
    }

    private boolean matches(RuleState rule, Map<String, String> attributes) {
        for (Map.Entry<String, String> condition : rule.conditions.entrySet()) {
            String actual = attributes.get(condition.getKey());
            if (!Objects.equals(actual, condition.getValue())) {
                return false;
            }
        }
        return true;
    }

    private boolean passesRollout(String definitionKey, RuleState rule, String subjectKey) {
        if (rule.rolloutPercentage == null) {
            return true;
        }
        CRC32 crc32 = new CRC32();
        crc32.update((definitionKey + ":" + rule.id + ":" + subjectKey).getBytes(StandardCharsets.UTF_8));
        long bucket = crc32.getValue() % 100;
        return bucket < rule.rolloutPercentage;
    }

    private void validateRules(List<RuleRequest> rules) {
        if (rules == null) {
            return;
        }
        if (rules.size() > MAX_RULES_PER_DEFINITION) {
            throw new IllegalArgumentException("No more than " + MAX_RULES_PER_DEFINITION + " rules are allowed.");
        }
        for (RuleRequest rule : rules) {
            if (rule.rolloutPercentage() != null && (rule.rolloutPercentage() < 0 || rule.rolloutPercentage() > 100)) {
                throw new IllegalArgumentException("rolloutPercentage must be between 0 and 100.");
            }
        }
    }

    private List<RuleState> buildRules(List<RuleRequest> requests) {
        if (requests == null || requests.isEmpty()) {
            return List.of();
        }
        List<RuleState> rules = new ArrayList<>();
        int index = 1;
        for (RuleRequest request : requests) {
            rules.add(new RuleState(
                    "rule-" + index,
                    Optional.ofNullable(normalizeText(request.name())).orElse("rule-" + index),
                    normalizeAttributes(request.conditions()),
                    request.rolloutPercentage(),
                    request.value().deepCopy()));
            index++;
        }
        return List.copyOf(rules);
    }

    private DefinitionState requireDefinition(String rawKey) {
        String key = normalizeKey(rawKey);
        DefinitionState definition = definitions.get(key);
        if (definition == null) {
            throw new IllegalArgumentException("Definition " + key + " does not exist.");
        }
        return definition;
    }

    private long oldestVersionInLog() {
        ChangeEventState tail = changes.peekLast();
        return tail == null ? currentVersion : tail.version;
    }

    private long nextVersion() {
        currentVersion += 1;
        return currentVersion;
    }

    private void addChange(String action, String key, String summary, long version, long changedAtMillis) {
        changes.addFirst(new ChangeEventState(version, action, key, summary, changedAtMillis));
        while (changes.size() > MAX_RECENT_CHANGES) {
            changes.removeLast();
        }
    }

    private DefinitionView toDefinitionView(DefinitionState state) {
        return new DefinitionView(
                state.key,
                state.type,
                state.defaultValue.deepCopy(),
                state.description,
                state.owner,
                state.version,
                Instant.ofEpochMilli(state.updatedAtMillis),
                state.rules.stream()
                        .map(rule -> new RuleView(rule.id, rule.name, rule.conditions, rule.rolloutPercentage, rule.value.deepCopy()))
                        .toList());
    }

    private ChangeEventView toChangeEventView(ChangeEventState state) {
        return new ChangeEventView(state.version, state.action, state.key, state.summary, Instant.ofEpochMilli(state.changedAtMillis));
    }

    private ClientStateView toClientStateView(ClientState state) {
        return new ClientStateView(
                state.clientId,
                state.cachedVersion,
                Instant.ofEpochMilli(state.lastSyncAtMillis),
                state.cache.size(),
                state.cache.values().stream().map(this::toClientCacheEntryView).toList());
    }

    private ClientCacheEntryView toClientCacheEntryView(ClientCacheEntry state) {
        return new ClientCacheEntryView(
                state.key,
                state.version,
                state.type,
                state.defaultValue.deepCopy(),
                state.ruleCount,
                Instant.ofEpochMilli(state.cachedAtMillis));
    }

    private String normalizeKey(String key) {
        String normalized = normalizeText(key);
        if (normalized == null || !normalized.matches("[A-Za-z0-9._-]+")) {
            throw new IllegalArgumentException("Keys must match [A-Za-z0-9._-]+.");
        }
        return normalized;
    }

    private String normalizeClientId(String clientId) {
        String normalized = normalizeText(clientId);
        if (normalized == null || normalized.isBlank()) {
            throw new IllegalArgumentException("clientId is required.");
        }
        return normalized;
    }

    private String normalizeSubjectKey(String subjectKey) {
        String normalized = normalizeText(subjectKey);
        if (normalized == null || normalized.isBlank()) {
            throw new IllegalArgumentException("subjectKey is required.");
        }
        return normalized;
    }

    private Map<String, String> normalizeAttributes(Map<String, String> attributes) {
        if (attributes == null || attributes.isEmpty()) {
            return Map.of();
        }
        Map<String, String> normalized = new LinkedHashMap<>();
        attributes.forEach((key, value) -> {
            String normalizedKey = normalizeText(key);
            String normalizedValue = normalizeText(value);
            if (normalizedKey != null && normalizedValue != null) {
                normalized.put(normalizedKey, normalizedValue);
            }
        });
        return Map.copyOf(normalized);
    }

    private String normalizeText(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private long now() {
        return timeSource.getAsLong();
    }

    private static final class DefinitionState {
        private final String key;
        private final DefinitionType type;
        private final JsonNode defaultValue;
        private final String description;
        private final String owner;
        private final long version;
        private final long updatedAtMillis;
        private final List<RuleState> rules;

        private DefinitionState(
                String key,
                DefinitionType type,
                JsonNode defaultValue,
                String description,
                String owner,
                long version,
                long updatedAtMillis,
                List<RuleState> rules) {
            this.key = key;
            this.type = type;
            this.defaultValue = defaultValue;
            this.description = description;
            this.owner = owner;
            this.version = version;
            this.updatedAtMillis = updatedAtMillis;
            this.rules = rules;
        }
    }

    private static final class RuleState {
        private final String id;
        private final String name;
        private final Map<String, String> conditions;
        private final Integer rolloutPercentage;
        private final JsonNode value;

        private RuleState(String id, String name, Map<String, String> conditions, Integer rolloutPercentage, JsonNode value) {
            this.id = id;
            this.name = name;
            this.conditions = conditions;
            this.rolloutPercentage = rolloutPercentage;
            this.value = value;
        }
    }

    private static final class ChangeEventState {
        private final long version;
        private final String action;
        private final String key;
        private final String summary;
        private final long changedAtMillis;

        private ChangeEventState(long version, String action, String key, String summary, long changedAtMillis) {
            this.version = version;
            this.action = action;
            this.key = key;
            this.summary = summary;
            this.changedAtMillis = changedAtMillis;
        }
    }

    private static final class ClientState {
        private final String clientId;
        private final Map<String, ClientCacheEntry> cache = new LinkedHashMap<>();
        private long cachedVersion;
        private long lastSyncAtMillis;

        private ClientState(String clientId) {
            this.clientId = clientId;
        }
    }

    private static final class ClientCacheEntry {
        private final String key;
        private final DefinitionType type;
        private final long version;
        private final JsonNode defaultValue;
        private final int ruleCount;
        private final long cachedAtMillis;

        private ClientCacheEntry(
                String key,
                DefinitionType type,
                long version,
                JsonNode defaultValue,
                int ruleCount,
                long cachedAtMillis) {
            this.key = key;
            this.type = type;
            this.version = version;
            this.defaultValue = defaultValue;
            this.ruleCount = ruleCount;
            this.cachedAtMillis = cachedAtMillis;
        }
    }
}
