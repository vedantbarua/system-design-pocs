package com.poc.logging.core;

public final class LogCollectorFactory {
  private LogCollectorFactory() {}

  public static LogCollector getCollector() {
    return DefaultLogCollector.getInstance();
  }
}
