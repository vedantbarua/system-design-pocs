package com.poc.logging.model;

import com.poc.logging.filters.LogFilter;

public class AlertRule {
  private final String name;
  private final int threshold;
  private final LogFilter filter;

  public AlertRule(String name, int threshold, LogFilter filter) {
    this.name = name;
    this.threshold = threshold;
    this.filter = filter;
  }

  public String getName() {
    return name;
  }

  public int getThreshold() {
    return threshold;
  }

  public LogFilter getFilter() {
    return filter;
  }
}
