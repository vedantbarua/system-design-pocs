package com.poc.matchingengine.model;

public class Trade {
  private final String tradeId;
  private final String symbol;
  private final String buyOrderId;
  private final String sellOrderId;
  private final long price;
  private final long quantity;
  private final long sequence;

  public Trade(String tradeId, String symbol, String buyOrderId, String sellOrderId, long price, long quantity, long sequence) {
    this.tradeId = tradeId;
    this.symbol = symbol;
    this.buyOrderId = buyOrderId;
    this.sellOrderId = sellOrderId;
    this.price = price;
    this.quantity = quantity;
    this.sequence = sequence;
  }

  public String getTradeId() {
    return tradeId;
  }

  public String getSymbol() {
    return symbol;
  }

  public String getBuyOrderId() {
    return buyOrderId;
  }

  public String getSellOrderId() {
    return sellOrderId;
  }

  public long getPrice() {
    return price;
  }

  public long getQuantity() {
    return quantity;
  }

  public long getSequence() {
    return sequence;
  }
}
