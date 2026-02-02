package com.poc.matchingengine.model;

public class PriceLevel {
  private final long price;
  private final long quantity;

  public PriceLevel(long price, long quantity) {
    this.price = price;
    this.quantity = quantity;
  }

  public long getPrice() {
    return price;
  }

  public long getQuantity() {
    return quantity;
  }
}
