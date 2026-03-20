package com.randomproject.tradinglog;

public class AlertEntry {
    private final AlertSeverity severity;
    private final String symbol;
    private final String message;

    public AlertEntry(AlertSeverity severity, String symbol, String message) {
        this.severity = severity;
        this.symbol = symbol;
        this.message = message;
    }

    public AlertSeverity getSeverity() {
        return severity;
    }

    public String getSymbol() {
        return symbol;
    }

    public String getMessage() {
        return message;
    }
}
