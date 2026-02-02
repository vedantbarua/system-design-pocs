package com.poc.matchingengine.api;

import com.poc.matchingengine.model.OrderBookSnapshot;
import com.poc.matchingengine.model.Trade;

import java.util.List;

public class MarketUpdate {
  private final OrderBookSnapshot snapshot;
  private final List<Trade> trades;

  public MarketUpdate(OrderBookSnapshot snapshot, List<Trade> trades) {
    this.snapshot = snapshot;
    this.trades = trades;
  }

  public OrderBookSnapshot getSnapshot() {
    return snapshot;
  }

  public List<Trade> getTrades() {
    return trades;
  }
}
