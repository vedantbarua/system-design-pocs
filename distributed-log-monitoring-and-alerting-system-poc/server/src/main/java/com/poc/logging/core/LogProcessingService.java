package com.poc.logging.core;

import com.poc.logging.model.LogEntry;
import com.poc.logging.pipeline.LogTransformer;
import com.poc.logging.store.LogStore;

public class LogProcessingService {
  private final LogTransformer transformerChain;
  private final AlertingService alertingService;
  private final LogStore logStore;

  public LogProcessingService(LogTransformer transformerChain, AlertingService alertingService, LogStore logStore) {
    this.transformerChain = transformerChain;
    this.alertingService = alertingService;
    this.logStore = logStore;
  }

  public LogEntry process(LogEntry entry) {
    LogEntry transformed = transformerChain.handle(entry);
    logStore.add(transformed);
    alertingService.evaluate(transformed);
    return transformed;
  }
}
