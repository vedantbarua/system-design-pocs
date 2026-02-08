package com.poc.logging.store;

import com.poc.logging.model.Alert;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

public class AlertStore {
  private final List<Alert> alerts = new CopyOnWriteArrayList<>();

  public void add(Alert alert) {
    alerts.add(alert);
  }

  public List<Alert> list() {
    return Collections.unmodifiableList(new ArrayList<>(alerts));
  }

  public void clear() {
    alerts.clear();
  }
}
