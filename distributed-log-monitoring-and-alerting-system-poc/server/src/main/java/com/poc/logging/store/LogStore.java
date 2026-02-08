package com.poc.logging.store;

import com.poc.logging.model.LogEntry;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

public class LogStore {
  private final List<LogEntry> logs = new CopyOnWriteArrayList<>();
  private final int limit;

  public LogStore(int limit) {
    this.limit = limit;
  }

  public void add(LogEntry entry) {
    logs.add(entry);
    if (logs.size() > limit) {
      logs.remove(0);
    }
  }

  public List<LogEntry> list() {
    return Collections.unmodifiableList(new ArrayList<>(logs));
  }

  public void clear() {
    logs.clear();
  }
}
