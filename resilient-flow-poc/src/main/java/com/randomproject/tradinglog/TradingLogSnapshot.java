package com.randomproject.tradinglog;

import java.util.List;
import java.util.Map;

public class TradingLogSnapshot {
    private final PortfolioSummary summary;
    private final List<PositionSnapshot> positions;
    private final List<TradeEntry> trades;
    private final List<AlertEntry> alerts;
    private final Map<String, java.math.BigDecimal> marketPrices;

    public TradingLogSnapshot(PortfolioSummary summary,
                              List<PositionSnapshot> positions,
                              List<TradeEntry> trades,
                              List<AlertEntry> alerts,
                              Map<String, java.math.BigDecimal> marketPrices) {
        this.summary = summary;
        this.positions = positions;
        this.trades = trades;
        this.alerts = alerts;
        this.marketPrices = marketPrices;
    }

    public PortfolioSummary getSummary() {
        return summary;
    }

    public List<PositionSnapshot> getPositions() {
        return positions;
    }

    public List<TradeEntry> getTrades() {
        return trades;
    }

    public List<AlertEntry> getAlerts() {
        return alerts;
    }

    public Map<String, java.math.BigDecimal> getMarketPrices() {
        return marketPrices;
    }
}
