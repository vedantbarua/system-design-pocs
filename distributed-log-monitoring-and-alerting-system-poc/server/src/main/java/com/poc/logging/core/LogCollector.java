package com.poc.logging.core;

import com.poc.logging.model.LogEntry;

public interface LogCollector {
  void collect(LogEntry entry);
}
