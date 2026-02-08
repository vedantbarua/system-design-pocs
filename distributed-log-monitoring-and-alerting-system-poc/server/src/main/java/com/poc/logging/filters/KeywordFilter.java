package com.poc.logging.filters;

import com.poc.logging.model.LogEntry;

public class KeywordFilter implements LogFilter {
  private final String keyword;

  public KeywordFilter(String keyword) {
    this.keyword = keyword == null ? "" : keyword.toLowerCase();
  }

  @Override
  public boolean matches(LogEntry entry) {
    if (entry == null || entry.getMessage() == null) {
      return false;
    }
    return entry.getMessage().toLowerCase().contains(keyword);
  }
}
