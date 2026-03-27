package com.randomproject.featureflag;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.time.Instant;
import java.util.List;
import java.util.Map;

enum DefinitionType {
    FLAG,
    CONFIG
}

record UpsertDefinitionRequest(
        @NotBlank String key,
        @NotNull DefinitionType type,
        @NotNull JsonNode defaultValue,
        String description,
        String owner,
        List<RuleRequest> rules) {
}

record RuleRequest(
        String name,
        Map<String, String> conditions,
        Integer rolloutPercentage,
        @NotNull JsonNode value) {
}

record EvaluateRequest(
        @NotBlank String key,
        @NotBlank String subjectKey,
        Map<String, String> attributes) {
}

record ClientSyncRequest(
        Long lastKnownVersion) {
}

record DeleteResult(
        String key,
        long version) {
}

record EvaluationResult(
        String key,
        DefinitionType type,
        JsonNode value,
        long version,
        String source,
        String matchedRule,
        boolean cacheable,
        Instant evaluatedAt) {
}

record RuleView(
        String id,
        String name,
        Map<String, String> conditions,
        Integer rolloutPercentage,
        JsonNode value) {
}

record DefinitionView(
        String key,
        DefinitionType type,
        JsonNode defaultValue,
        String description,
        String owner,
        long version,
        Instant updatedAt,
        List<RuleView> rules) {
}

record ChangeEventView(
        long version,
        String action,
        String key,
        String summary,
        Instant changedAt) {
}

record ClientCacheEntryView(
        String key,
        long version,
        DefinitionType type,
        JsonNode defaultValue,
        int ruleCount,
        Instant cachedAt) {
}

record ClientStateView(
        String clientId,
        long cachedVersion,
        Instant lastSyncAt,
        int cachedEntries,
        List<ClientCacheEntryView> cache) {
}

record ClientSyncResponse(
        String clientId,
        long version,
        boolean fullSnapshot,
        List<DefinitionView> upserts,
        List<String> removedKeys,
        List<ClientCacheEntryView> cache,
        Instant syncedAt) {
}

record ServiceSnapshot(
        long currentVersion,
        int definitionCount,
        int clientCount,
        int recentChangeCount,
        List<DefinitionView> definitions,
        List<ClientStateView> clients,
        List<ChangeEventView> changes) {
}
