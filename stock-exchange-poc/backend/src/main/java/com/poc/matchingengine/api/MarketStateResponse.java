package com.poc.matchingengine.api;

import com.poc.matchingengine.model.OrderBookSnapshot;
import com.poc.matchingengine.model.Trade;

import java.util.List;

public class MarketStateResponse {
  private final OrderBookSnapshot snapshot;
  private final List<Trade> recentTrades;

  public MarketStateResponse(OrderBookSnapshot snapshot, List<Trade> recentTrades) {
    this.snapshot = snapshot;
    this.recentTrades = recentTrades;
  }

  public OrderBookSnapshot getSnapshot() {
    return snapshot;
  }

  public List<Trade> getRecentTrades() {
    return recentTrades;
  }
}
