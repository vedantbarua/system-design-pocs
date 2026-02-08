package com.poc.logging.core;

import com.poc.logging.model.Alert;
import com.poc.logging.model.AlertRule;
import com.poc.logging.model.LogEntry;
import com.poc.logging.observability.AlertObserver;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

public class AlertingService {
  private final List<AlertObserver> observers = new ArrayList<>();
  private final List<AlertRule> rules = new ArrayList<>();
  private final Map<String, Integer> counters = new ConcurrentHashMap<>();

  public void registerObserver(AlertObserver observer) {
    observers.add(observer);
  }

  public void registerRule(AlertRule rule) {
    rules.add(rule);
  }

  public void evaluate(LogEntry entry) {
    for (AlertRule rule : rules) {
      if (!rule.getFilter().matches(entry)) {
        continue;
      }
      int count = counters.merge(rule.getName(), 1, Integer::sum);
      if (count >= rule.getThreshold()) {
        counters.put(rule.getName(), 0);
        Alert alert = new Alert(
            rule.getName(),
            String.format("Threshold met for rule '%s' (%d)", rule.getName(), rule.getThreshold()),
            Instant.now(),
            entry.getMetadata()
        );
        notifyObservers(alert);
      }
    }
  }

  private void notifyObservers(Alert alert) {
    for (AlertObserver observer : observers) {
      observer.onAlert(alert);
    }
  }
}
