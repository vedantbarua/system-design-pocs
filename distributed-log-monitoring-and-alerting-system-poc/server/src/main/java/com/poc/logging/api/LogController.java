package com.poc.logging.api;

import com.poc.logging.core.LogCollectorFactory;
import com.poc.logging.core.LogProcessingService;
import com.poc.logging.model.Alert;
import com.poc.logging.model.LogEntry;
import com.poc.logging.store.AlertStore;
import com.poc.logging.store.LogStore;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class LogController {
  private final LogProcessingService logProcessingService;
  private final LogStore logStore;
  private final AlertStore alertStore;

  public LogController(LogProcessingService logProcessingService, LogStore logStore, AlertStore alertStore) {
    this.logProcessingService = logProcessingService;
    this.logStore = logStore;
    this.alertStore = alertStore;
  }

  @PostMapping("/logs")
  @ResponseStatus(HttpStatus.ACCEPTED)
  public LogEntry ingest(@Valid @RequestBody LogEntry entry) {
    LogCollectorFactory.getCollector().collect(entry);
    return logProcessingService.process(entry);
  }

  @GetMapping("/logs")
  public List<LogEntry> listLogs() {
    return logStore.list();
  }

  @GetMapping("/alerts")
  public List<Alert> listAlerts() {
    return alertStore.list();
  }

  @DeleteMapping("/alerts")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void clearAlerts() {
    alertStore.clear();
  }
}
