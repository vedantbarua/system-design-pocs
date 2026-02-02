package com.poc.matchingengine.engine;

import com.poc.matchingengine.model.Order;

public class CommandEvent {
  private final CommandType type;
  private final Order order;

  public CommandEvent(CommandType type, Order order) {
    this.type = type;
    this.order = order;
  }

  public CommandType getType() {
    return type;
  }

  public Order getOrder() {
    return order;
  }
}
