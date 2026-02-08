package com.poc.logging.filters;

import com.poc.logging.model.LogEntry;
import com.poc.logging.model.LogLevel;

public class ErrorLevelFilter implements LogFilter {
  private final LogLevel minLevel;

  public ErrorLevelFilter(LogLevel minLevel) {
    this.minLevel = minLevel;
  }

  @Override
  public boolean matches(LogEntry entry) {
    if (entry == null || entry.getLevel() == null) {
      return false;
    }
    return entry.getLevel().ordinal() >= minLevel.ordinal();
  }
}
