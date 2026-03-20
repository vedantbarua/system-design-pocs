package com.randomproject.tradinglog;

import java.math.BigDecimal;
import java.time.Instant;

public class TradeEntry {
    private final String id;
    private final String symbol;
    private final TradeSide side;
    private final int quantity;
    private final BigDecimal price;
    private final String trader;
    private final String venue;
    private final Instant executedAt;
    private final BigDecimal notional;

    public TradeEntry(String id,
                      String symbol,
                      TradeSide side,
                      int quantity,
                      BigDecimal price,
                      String trader,
                      String venue,
                      Instant executedAt,
                      BigDecimal notional) {
        this.id = id;
        this.symbol = symbol;
        this.side = side;
        this.quantity = quantity;
        this.price = price;
        this.trader = trader;
        this.venue = venue;
        this.executedAt = executedAt;
        this.notional = notional;
    }

    public String getId() {
        return id;
    }

    public String getSymbol() {
        return symbol;
    }

    public TradeSide getSide() {
        return side;
    }

    public int getQuantity() {
        return quantity;
    }

    public BigDecimal getPrice() {
        return price;
    }

    public String getTrader() {
        return trader;
    }

    public String getVenue() {
        return venue;
    }

    public Instant getExecutedAt() {
        return executedAt;
    }

    public BigDecimal getNotional() {
        return notional;
    }
}
