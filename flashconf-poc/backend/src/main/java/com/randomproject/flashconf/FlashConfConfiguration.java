package com.randomproject.flashconf;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.Duration;

@Configuration
public class FlashConfConfiguration {

    @Bean
    public CentralConfigStore centralConfigStore() {
        return new CentralConfigStore();
    }

    @Bean
    public TargetingEngine targetingEngine() {
        return new TargetingEngine();
    }

    @Bean
    public RulesetService rulesetService(CentralConfigStore store,
                                         TargetingEngine engine,
                                         @Value("${flashconf.cache.ttl-seconds:10}") int ttlSeconds,
                                         @Value("${flashconf.cache.max-size:1000}") int maxSize) {
        return new RulesetService(store, engine, Duration.ofSeconds(ttlSeconds), maxSize);
    }

    @Bean
    public AuditLog auditLog(@Value("${flashconf.audit.max-entries:200}") int maxEntries) {
        return new AuditLog(maxEntries);
    }

    @Bean
    public SseHub sseHub() {
        return new SseHub();
    }

    @Bean
    public FlashConfService flashConfService(CentralConfigStore store,
                                             RulesetService rulesetService,
                                             AuditLog auditLog,
                                             SseHub sseHub) {
        return new FlashConfService(store, rulesetService, auditLog, sseHub);
    }
}
