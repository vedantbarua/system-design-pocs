package com.poc.logging.model;

import java.time.Instant;
import java.util.Map;

public class Alert {
  private String ruleName;
  private String message;
  private Instant triggeredAt;
  private Map<String, String> context;

  public Alert() {}

  public Alert(String ruleName, String message, Instant triggeredAt, Map<String, String> context) {
    this.ruleName = ruleName;
    this.message = message;
    this.triggeredAt = triggeredAt;
    this.context = context;
  }

  public String getRuleName() {
    return ruleName;
  }

  public void setRuleName(String ruleName) {
    this.ruleName = ruleName;
  }

  public String getMessage() {
    return message;
  }

  public void setMessage(String message) {
    this.message = message;
  }

  public Instant getTriggeredAt() {
    return triggeredAt;
  }

  public void setTriggeredAt(Instant triggeredAt) {
    this.triggeredAt = triggeredAt;
  }

  public Map<String, String> getContext() {
    return context;
  }

  public void setContext(Map<String, String> context) {
    this.context = context;
  }
}
