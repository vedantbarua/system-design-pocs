package com.poc.matchingengine.api;

public class OrderResponse {
  private final String orderId;
  private final long sequence;

  public OrderResponse(String orderId, long sequence) {
    this.orderId = orderId;
    this.sequence = sequence;
  }

  public String getOrderId() {
    return orderId;
  }

  public long getSequence() {
    return sequence;
  }
}
