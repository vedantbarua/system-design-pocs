package com.poc.matchingengine.model;

import java.util.List;

public class OrderBookSnapshot {
  private final String symbol;
  private final long sequence;
  private final List<PriceLevel> bids;
  private final List<PriceLevel> asks;

  public OrderBookSnapshot(String symbol, long sequence, List<PriceLevel> bids, List<PriceLevel> asks) {
    this.symbol = symbol;
    this.sequence = sequence;
    this.bids = bids;
    this.asks = asks;
  }

  public String getSymbol() {
    return symbol;
  }

  public long getSequence() {
    return sequence;
  }

  public List<PriceLevel> getBids() {
    return bids;
  }

  public List<PriceLevel> getAsks() {
    return asks;
  }
}
