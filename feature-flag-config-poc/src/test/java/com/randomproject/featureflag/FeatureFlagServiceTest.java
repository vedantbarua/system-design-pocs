package com.randomproject.featureflag;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class FeatureFlagServiceTest {
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    void shouldMatchTargetedRuleBeforeDefault() throws Exception {
        AtomicLong clock = new AtomicLong(1_000_000L);
        FeatureFlagService service = new FeatureFlagService(clock::get);
        service.upsertDefinition(new UpsertDefinitionRequest(
                "checkout.redesign",
                DefinitionType.FLAG,
                objectMapper.readTree("false"),
                "flag",
                "growth",
                List.of(new RuleRequest("premium-us", Map.of("plan", "premium", "region", "us"), null, objectMapper.readTree("true")))));

        EvaluationResult result = service.evaluate(new EvaluateRequest("checkout.redesign", "user-1", Map.of("plan", "premium", "region", "us")));
        EvaluationResult fallback = service.evaluate(new EvaluateRequest("checkout.redesign", "user-2", Map.of("plan", "free", "region", "us")));

        assertTrue(result.value().booleanValue());
        assertEquals("premium-us", result.matchedRule());
        assertFalse(fallback.value().booleanValue());
        assertEquals("default", fallback.source());
    }

    @Test
    void shouldUseStablePercentageRollout() throws Exception {
        AtomicLong clock = new AtomicLong(1_000_000L);
        FeatureFlagService service = new FeatureFlagService(clock::get);
        service.upsertDefinition(new UpsertDefinitionRequest(
                "search.ranker-v2",
                DefinitionType.FLAG,
                objectMapper.readTree("false"),
                null,
                null,
                List.of(new RuleRequest("beta", Map.of("cohort", "beta"), 50, objectMapper.readTree("true")))));

        EvaluationResult first = service.evaluate(new EvaluateRequest("search.ranker-v2", "subject-42", Map.of("cohort", "beta")));
        EvaluationResult second = service.evaluate(new EvaluateRequest("search.ranker-v2", "subject-42", Map.of("cohort", "beta")));

        assertEquals(first.value(), second.value());
        assertEquals(first.source(), second.source());
    }

    @Test
    void shouldPropagateUpdatesToClientCacheIncrementally() throws Exception {
        AtomicLong clock = new AtomicLong(1_000_000L);
        FeatureFlagService service = new FeatureFlagService(clock::get);
        service.upsertDefinition(new UpsertDefinitionRequest(
                "pricing.copy",
                DefinitionType.CONFIG,
                objectMapper.readTree("\"v1\""),
                null,
                null,
                List.of()));

        ClientSyncResponse first = service.syncClient("web-bff", 0L);
        assertTrue(first.fullSnapshot());
        assertEquals(1, first.cache().size());

        clock.addAndGet(1_000L);
        service.upsertDefinition(new UpsertDefinitionRequest(
                "pricing.copy",
                DefinitionType.CONFIG,
                objectMapper.readTree("\"v2\""),
                null,
                null,
                List.of()));

        ClientSyncResponse second = service.syncClient("web-bff", first.version());

        assertFalse(second.fullSnapshot());
        assertEquals(1, second.upserts().size());
        assertEquals("v2", second.cache().get(0).defaultValue().textValue());
    }

    @Test
    void shouldRemoveDeletedDefinitionFromClientCache() throws Exception {
        AtomicLong clock = new AtomicLong(1_000_000L);
        FeatureFlagService service = new FeatureFlagService(clock::get);
        service.upsertDefinition(new UpsertDefinitionRequest(
                "mobile.paywall",
                DefinitionType.FLAG,
                objectMapper.readTree("true"),
                null,
                null,
                List.of()));
        ClientSyncResponse initial = service.syncClient("android-app", 0L);

        service.deleteDefinition("mobile.paywall");
        ClientSyncResponse next = service.syncClient("android-app", initial.version());

        assertTrue(next.removedKeys().contains("mobile.paywall"));
        assertTrue(next.cache().isEmpty());
    }
}
