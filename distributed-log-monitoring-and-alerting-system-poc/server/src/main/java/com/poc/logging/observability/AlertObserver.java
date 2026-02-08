package com.poc.logging.observability;

import com.poc.logging.model.Alert;

public interface AlertObserver {
  void onAlert(Alert alert);
}
