package com.poc.logging.filters;

import com.poc.logging.model.LogEntry;

public interface LogFilter {
  boolean matches(LogEntry entry);
}
