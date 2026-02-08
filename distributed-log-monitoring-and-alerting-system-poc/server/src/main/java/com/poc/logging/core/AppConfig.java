package com.poc.logging.core;

import com.poc.logging.filters.AllOfFilter;
import com.poc.logging.filters.ErrorLevelFilter;
import com.poc.logging.filters.KeywordFilter;
import com.poc.logging.model.AlertRule;
import com.poc.logging.model.LogLevel;
import com.poc.logging.observability.ConsoleAlertSink;
import com.poc.logging.observability.InMemoryAlertSink;
import com.poc.logging.pipeline.LogTransformer;
import com.poc.logging.pipeline.MetadataEnricher;
import com.poc.logging.pipeline.PiiScrubber;
import com.poc.logging.pipeline.TimestampNormalizer;
import com.poc.logging.store.AlertStore;
import com.poc.logging.store.LogStore;
import java.util.List;
import java.util.Map;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class AppConfig {
  @Bean
  public LogTransformer transformerChain() {
    PiiScrubber scrubber = new PiiScrubber();
    TimestampNormalizer timestampNormalizer = new TimestampNormalizer();
    MetadataEnricher enricher = new MetadataEnricher(Map.of(
        "env", "poc",
        "region", "us-east-1"
    ));
    scrubber.setNext(timestampNormalizer).setNext(enricher);
    return scrubber;
  }

  @Bean
  public AlertStore alertStore() {
    return new AlertStore();
  }

  @Bean
  public LogStore logStore() {
    return new LogStore(200);
  }

  @Bean
  public AlertingService alertingService(AlertStore alertStore) {
    AlertingService service = new AlertingService();
    service.registerObserver(new ConsoleAlertSink());
    service.registerObserver(new InMemoryAlertSink(alertStore));

    service.registerRule(new AlertRule(
        "errors_over_threshold",
        3,
        new ErrorLevelFilter(LogLevel.ERROR)
    ));

    service.registerRule(new AlertRule(
        "trade_rejected",
        2,
        new KeywordFilter("trade rejected")
    ));

    service.registerRule(new AlertRule(
        "fatal_matching_engine",
        1,
        new AllOfFilter(List.of(
            new ErrorLevelFilter(LogLevel.FATAL),
            new KeywordFilter("matching")
        ))
    ));

    return service;
  }

  @Bean
  public LogProcessingService logProcessingService(LogTransformer transformerChain, AlertingService alertingService, LogStore logStore) {
    return new LogProcessingService(transformerChain, alertingService, logStore);
  }
}
