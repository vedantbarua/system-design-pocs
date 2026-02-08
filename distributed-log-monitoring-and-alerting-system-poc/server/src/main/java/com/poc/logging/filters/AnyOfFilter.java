package com.poc.logging.filters;

import com.poc.logging.model.LogEntry;
import java.util.List;

public class AnyOfFilter implements LogFilter {
  private final List<LogFilter> filters;

  public AnyOfFilter(List<LogFilter> filters) {
    this.filters = filters;
  }

  @Override
  public boolean matches(LogEntry entry) {
    if (filters == null || filters.isEmpty()) {
      return false;
    }
    return filters.stream().anyMatch(filter -> filter.matches(entry));
  }
}
