package com.poc.logging.pipeline;

import com.poc.logging.model.LogEntry;
import java.util.regex.Pattern;

public class PiiScrubber extends AbstractTransformer {
  private static final Pattern EMAIL = Pattern.compile("[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}", Pattern.CASE_INSENSITIVE);
  private static final Pattern CARD = Pattern.compile("\\b\\d{13,16}\\b");

  @Override
  protected LogEntry apply(LogEntry entry) {
    String message = entry.getMessage();
    if (message == null) {
      return entry;
    }
    message = EMAIL.matcher(message).replaceAll("[REDACTED_EMAIL]");
    message = CARD.matcher(message).replaceAll("[REDACTED_CARD]");
    entry.setMessage(message);
    return entry;
  }
}
