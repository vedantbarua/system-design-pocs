package com.randomproject.tradinglog;

import java.math.BigDecimal;

public class PositionSnapshot {
    private final String symbol;
    private final int buyQuantity;
    private final int sellQuantity;
    private final int netQuantity;
    private final BigDecimal averageOpenPrice;
    private final BigDecimal marketPrice;
    private final BigDecimal grossExposure;
    private final BigDecimal marketValue;
    private final BigDecimal realizedPnl;
    private final BigDecimal unrealizedPnl;
    private final BigDecimal totalPnl;

    public PositionSnapshot(String symbol,
                            int buyQuantity,
                            int sellQuantity,
                            int netQuantity,
                            BigDecimal averageOpenPrice,
                            BigDecimal marketPrice,
                            BigDecimal grossExposure,
                            BigDecimal marketValue,
                            BigDecimal realizedPnl,
                            BigDecimal unrealizedPnl,
                            BigDecimal totalPnl) {
        this.symbol = symbol;
        this.buyQuantity = buyQuantity;
        this.sellQuantity = sellQuantity;
        this.netQuantity = netQuantity;
        this.averageOpenPrice = averageOpenPrice;
        this.marketPrice = marketPrice;
        this.grossExposure = grossExposure;
        this.marketValue = marketValue;
        this.realizedPnl = realizedPnl;
        this.unrealizedPnl = unrealizedPnl;
        this.totalPnl = totalPnl;
    }

    public String getSymbol() {
        return symbol;
    }

    public int getBuyQuantity() {
        return buyQuantity;
    }

    public int getSellQuantity() {
        return sellQuantity;
    }

    public int getNetQuantity() {
        return netQuantity;
    }

    public BigDecimal getAverageOpenPrice() {
        return averageOpenPrice;
    }

    public BigDecimal getMarketPrice() {
        return marketPrice;
    }

    public BigDecimal getGrossExposure() {
        return grossExposure;
    }

    public BigDecimal getMarketValue() {
        return marketValue;
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
}
