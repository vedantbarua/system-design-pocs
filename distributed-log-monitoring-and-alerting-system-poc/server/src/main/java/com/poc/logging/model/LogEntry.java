package com.poc.logging.model;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;

public class LogEntry {
  @NotBlank
  private String source;

  @NotBlank
  private String module;

  @NotNull
  private LogLevel level;

  @NotBlank
  private String message;

  private String originalTimestamp;
  private Instant timestamp;
  private Map<String, String> metadata = new HashMap<>();

  public String getSource() {
    return source;
  }

  public void setSource(String source) {
    this.source = source;
  }

  public String getModule() {
    return module;
  }

  public void setModule(String module) {
    this.module = module;
  }

  public LogLevel getLevel() {
    return level;
  }

  public void setLevel(LogLevel level) {
    this.level = level;
  }

  public String getMessage() {
    return message;
  }

  public void setMessage(String message) {
    this.message = message;
  }

  public String getOriginalTimestamp() {
    return originalTimestamp;
  }

  public void setOriginalTimestamp(String originalTimestamp) {
    this.originalTimestamp = originalTimestamp;
  }

  public Instant getTimestamp() {
    return timestamp;
  }

  public void setTimestamp(Instant timestamp) {
    this.timestamp = timestamp;
  }

  public Map<String, String> getMetadata() {
    return metadata;
  }

  public void setMetadata(Map<String, String> metadata) {
    this.metadata = metadata == null ? new HashMap<>() : metadata;
  }
}
