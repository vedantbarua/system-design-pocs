package com.poc.logging.pipeline;

import com.poc.logging.model.LogEntry;
import java.time.Instant;

public class TimestampNormalizer extends AbstractTransformer {
  @Override
  protected LogEntry apply(LogEntry entry) {
    if (entry.getTimestamp() != null) {
      return entry;
    }

    String original = entry.getOriginalTimestamp();
    if (original == null || original.isBlank()) {
      entry.setTimestamp(Instant.now());
      return entry;
    }

    try {
      entry.setTimestamp(Instant.parse(original));
      return entry;
    } catch (Exception ignored) {
      // fall through
    }

    try {
      long epochMillis = Long.parseLong(original);
      entry.setTimestamp(Instant.ofEpochMilli(epochMillis));
      return entry;
    } catch (Exception ignored) {
      entry.setTimestamp(Instant.now());
      return entry;
    }
  }
}
