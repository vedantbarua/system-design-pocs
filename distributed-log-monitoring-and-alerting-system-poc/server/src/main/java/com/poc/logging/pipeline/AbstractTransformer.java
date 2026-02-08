package com.poc.logging.pipeline;

import com.poc.logging.model.LogEntry;

public abstract class AbstractTransformer implements LogTransformer {
  private LogTransformer next;

  @Override
  public LogTransformer setNext(LogTransformer next) {
    this.next = next;
    return next;
  }

  @Override
  public LogEntry handle(LogEntry entry) {
    LogEntry transformed = apply(entry);
    if (next == null) {
      return transformed;
    }
    return next.handle(transformed);
  }

  protected abstract LogEntry apply(LogEntry entry);
}
