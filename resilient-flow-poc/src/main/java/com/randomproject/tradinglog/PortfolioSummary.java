package com.randomproject.tradinglog;

import java.math.BigDecimal;

public class PortfolioSummary {
    private final int symbolsTracked;
    private final int openPositions;
    private final int totalTrades;
    private final BigDecimal grossExposure;
    private final BigDecimal realizedPnl;
    private final BigDecimal unrealizedPnl;
    private final BigDecimal totalPnl;
    private final int alerts;

    public PortfolioSummary(int symbolsTracked,
                            int openPositions,
                            int totalTrades,
                            BigDecimal grossExposure,
                            BigDecimal realizedPnl,
                            BigDecimal unrealizedPnl,
                            BigDecimal totalPnl,
                            int alerts) {
        this.symbolsTracked = symbolsTracked;
        this.openPositions = openPositions;
        this.totalTrades = totalTrades;
        this.grossExposure = grossExposure;
        this.realizedPnl = realizedPnl;
        this.unrealizedPnl = unrealizedPnl;
        this.totalPnl = totalPnl;
        this.alerts = alerts;
    }

    public int getSymbolsTracked() {
        return symbolsTracked;
    }

    public int getOpenPositions() {
        return openPositions;
    }

    public int getTotalTrades() {
        return totalTrades;
    }

    public BigDecimal getGrossExposure() {
        return grossExposure;
    }

    public BigDecimal getRealizedPnl() {
        return realizedPnl;
    }

    public BigDecimal getUnrealizedPnl() {
        return unrealizedPnl;
    }

    public BigDecimal getTotalPnl() {
        return totalPnl;
    }

    public int getAlerts() {
        return alerts;
    }
}
