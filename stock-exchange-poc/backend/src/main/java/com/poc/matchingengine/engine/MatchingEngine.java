package com.poc.matchingengine.engine;

import com.poc.matchingengine.model.Order;
import com.poc.matchingengine.model.OrderBookSnapshot;
import com.poc.matchingengine.model.Trade;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.function.BiConsumer;

public class MatchingEngine {
  private final Map<String, OrderBook> books = new HashMap<>();
  private final int topLevels;
  private final BiConsumer<OrderBookSnapshot, List<Trade>> publisher;

  public MatchingEngine(int topLevels, BiConsumer<OrderBookSnapshot, List<Trade>> publisher) {
    this.topLevels = topLevels;
    this.publisher = publisher;
  }

  public void handleOrder(Order order) {
    OrderBook book = books.computeIfAbsent(order.getSymbol(), OrderBook::new);
    List<Trade> trades = book.process(order);
    OrderBookSnapshot snapshot = new OrderBookSnapshot(
        order.getSymbol(),
        order.getSequence(),
        book.topBids(topLevels),
        book.topAsks(topLevels));
    publisher.accept(snapshot, trades);
  }
}
