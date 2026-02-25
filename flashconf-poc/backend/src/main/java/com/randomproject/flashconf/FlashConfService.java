package com.randomproject.flashconf;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;

public class FlashConfService {
    private final CentralConfigStore store;
    private final RulesetService rulesetService;
    private final AuditLog auditLog;
    private final SseHub sseHub;

    public FlashConfService(CentralConfigStore store, RulesetService rulesetService, AuditLog auditLog, SseHub sseHub) {
        this.store = store;
        this.rulesetService = rulesetService;
        this.auditLog = auditLog;
        this.sseHub = sseHub;
    }

    public List<FeatureFlag> listFlags() {
        return store.list();
    }

    public Optional<FeatureFlag> getFlag(String key) {
        return store.get(key);
    }

    public FeatureFlag upsertFlag(FlagUpsertRequest request) {
        FeatureFlag before = store.get(request.getKey()).orElse(null);
        FeatureFlag flag = new FeatureFlag(
                request.getKey(),
                request.getDescription(),
                request.isEnabled(),
                request.getRules(),
                Instant.now()
        );
        store.upsert(flag);
        recordAudit(before, flag, request.getActor(), before == null ? "CREATE" : "UPDATE");
        rulesetService.invalidateAll();
        sseHub.broadcastRulesets(rulesetService);
        return flag;
    }

    public Optional<FeatureFlag> deleteFlag(String key, String actor) {
        Optional<FeatureFlag> removed = store.delete(key);
        removed.ifPresent(flag -> {
            recordAudit(flag, null, actor, "DELETE");
            rulesetService.invalidateAll();
            sseHub.broadcastRulesets(rulesetService);
        });
        return removed;
    }

    public RulesetResponse ruleset(String clientId, Map<String, String> attributes) {
        return rulesetService.getRuleset(clientId, attributes);
    }

    public List<ChangeLogEntry> auditTrail() {
        return auditLog.list();
    }

    public SseHub getSseHub() {
        return sseHub;
    }

    private void recordAudit(FeatureFlag before, FeatureFlag after, String actor, String action) {
        String beforeState = before == null ? null : summarizeFlag(before);
        String afterState = after == null ? null : summarizeFlag(after);
        auditLog.add(new ChangeLogEntry(Instant.now(), actor == null ? "unknown" : actor, action,
                before != null ? before.getKey() : after.getKey(), beforeState, afterState));
    }

    private String summarizeFlag(FeatureFlag flag) {
        int ruleCount = flag.getRules() == null ? 0 : flag.getRules().size();
        return String.format("enabled=%s rules=%d updatedAt=%s", flag.isEnabled(), ruleCount, flag.getUpdatedAt());
    }
}
