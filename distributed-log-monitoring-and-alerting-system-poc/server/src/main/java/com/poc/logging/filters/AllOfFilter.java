package com.poc.logging.filters;

import com.poc.logging.model.LogEntry;
import java.util.List;

public class AllOfFilter implements LogFilter {
  private final List<LogFilter> filters;

  public AllOfFilter(List<LogFilter> filters) {
    this.filters = filters;
  }

  @Override
  public boolean matches(LogEntry entry) {
    if (filters == null || filters.isEmpty()) {
      return false;
    }
    return filters.stream().allMatch(filter -> filter.matches(entry));
  }
}
