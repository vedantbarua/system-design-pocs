package com.poc.logging.observability;

import com.poc.logging.model.Alert;
import com.poc.logging.store.AlertStore;

public class InMemoryAlertSink implements AlertObserver {
  private final AlertStore store;

  public InMemoryAlertSink(AlertStore store) {
    this.store = store;
  }

  @Override
  public void onAlert(Alert alert) {
    store.add(alert);
  }
}
