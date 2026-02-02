package com.poc.matchingengine.model;

import java.time.Instant;

public class Order {
  private final String orderId;
  private final String symbol;
  private final OrderSide side;
  private final OrderType type;
  private final long price;
  private long quantity;
  private final Instant timestamp;
  private long sequence;

  public Order(String orderId, String symbol, OrderSide side, OrderType type, long price, long quantity, Instant timestamp) {
    this.orderId = orderId;
    this.symbol = symbol;
    this.side = side;
    this.type = type;
    this.price = price;
    this.quantity = quantity;
    this.timestamp = timestamp;
  }

  public String getOrderId() {
    return orderId;
  }

  public String getSymbol() {
    return symbol;
  }

  public OrderSide getSide() {
    return side;
  }

  public OrderType getType() {
    return type;
  }

  public long getPrice() {
    return price;
  }

  public long getQuantity() {
    return quantity;
  }

  public void setQuantity(long quantity) {
    this.quantity = quantity;
  }

  public Instant getTimestamp() {
    return timestamp;
  }

  public long getSequence() {
    return sequence;
  }

  public void setSequence(long sequence) {
    this.sequence = sequence;
  }
}
