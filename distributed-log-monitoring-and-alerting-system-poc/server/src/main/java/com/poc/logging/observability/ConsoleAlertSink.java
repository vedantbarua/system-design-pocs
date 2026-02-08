package com.poc.logging.observability;

import com.poc.logging.model.Alert;

public class ConsoleAlertSink implements AlertObserver {
  @Override
  public void onAlert(Alert alert) {
    System.out.printf("ALERT [%s] %s at %s%n", alert.getRuleName(), alert.getMessage(), alert.getTriggeredAt());
  }
}
