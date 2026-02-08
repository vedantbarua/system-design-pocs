package com.poc.logging.core;

import com.poc.logging.model.LogEntry;

public class DefaultLogCollector implements LogCollector {
  private static final DefaultLogCollector INSTANCE = new DefaultLogCollector();

  private DefaultLogCollector() {}

  public static DefaultLogCollector getInstance() {
    return INSTANCE;
  }

  @Override
  public void collect(LogEntry entry) {
    // no-op here, collection is orchestrated by LogProcessingService
  }
}
