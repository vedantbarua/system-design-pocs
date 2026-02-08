package com.poc.logging.pipeline;

import com.poc.logging.model.LogEntry;
import java.util.Map;

public class MetadataEnricher extends AbstractTransformer {
  private final Map<String, String> defaults;

  public MetadataEnricher(Map<String, String> defaults) {
    this.defaults = defaults;
  }

  @Override
  protected LogEntry apply(LogEntry entry) {
    Map<String, String> metadata = entry.getMetadata();
    defaults.forEach(metadata::putIfAbsent);
    entry.setMetadata(metadata);
    return entry;
  }
}
