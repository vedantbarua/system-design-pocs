package com.poc.logging.pipeline;

import com.poc.logging.model.LogEntry;

public interface LogTransformer {
  LogTransformer setNext(LogTransformer next);
  LogEntry handle(LogEntry entry);
}
