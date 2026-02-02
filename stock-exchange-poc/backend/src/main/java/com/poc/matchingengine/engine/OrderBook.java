package com.poc.matchingengine.engine;

import com.poc.matchingengine.model.Order;
import com.poc.matchingengine.model.OrderSide;
import com.poc.matchingengine.model.PriceLevel;
import com.poc.matchingengine.model.Trade;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.Deque;
import java.util.List;
import java.util.NavigableMap;
import java.util.TreeMap;
import java.util.concurrent.atomic.AtomicLong;

public class OrderBook {
  private final String symbol;
  private final NavigableMap<Long, Deque<Order>> bids = new TreeMap<>(Comparator.reverseOrder());
  private final NavigableMap<Long, Deque<Order>> asks = new TreeMap<>();
  private final AtomicLong tradeSequence = new AtomicLong(1);

  public OrderBook(String symbol) {
    this.symbol = symbol;
  }

  public List<Trade> process(Order incoming) {
    if (incoming.getSide() == OrderSide.BUY) {
      return matchBuy(incoming);
    }
    return matchSell(incoming);
  }

  private List<Trade> matchBuy(Order incoming) {
    List<Trade> trades = new ArrayList<>();
    while (incoming.getQuantity() > 0 && !asks.isEmpty()) {
      Long bestAskPrice = asks.firstKey();
      if (incoming.getPrice() < bestAskPrice) {
        break;
      }
      Deque<Order> levelQueue = asks.get(bestAskPrice);
      Order resting = levelQueue.peekFirst();
      long tradedQty = Math.min(incoming.getQuantity(), resting.getQuantity());
      incoming.setQuantity(incoming.getQuantity() - tradedQty);
      resting.setQuantity(resting.getQuantity() - tradedQty);
      trades.add(new Trade(
          tradeId(), symbol, incoming.getOrderId(), resting.getOrderId(), bestAskPrice, tradedQty, incoming.getSequence()));

      if (resting.getQuantity() == 0) {
        levelQueue.pollFirst();
        if (levelQueue.isEmpty()) {
          asks.remove(bestAskPrice);
        }
      }
    }
    if (incoming.getQuantity() > 0) {
      bids.computeIfAbsent(incoming.getPrice(), k -> new ArrayDeque<>()).addLast(incoming);
    }
    return trades;
  }

  private List<Trade> matchSell(Order incoming) {
    List<Trade> trades = new ArrayList<>();
    while (incoming.getQuantity() > 0 && !bids.isEmpty()) {
      Long bestBidPrice = bids.firstKey();
      if (incoming.getPrice() > bestBidPrice) {
        break;
      }
      Deque<Order> levelQueue = bids.get(bestBidPrice);
      Order resting = levelQueue.peekFirst();
      long tradedQty = Math.min(incoming.getQuantity(), resting.getQuantity());
      incoming.setQuantity(incoming.getQuantity() - tradedQty);
      resting.setQuantity(resting.getQuantity() - tradedQty);
      trades.add(new Trade(
          tradeId(), symbol, resting.getOrderId(), incoming.getOrderId(), bestBidPrice, tradedQty, incoming.getSequence()));

      if (resting.getQuantity() == 0) {
        levelQueue.pollFirst();
        if (levelQueue.isEmpty()) {
          bids.remove(bestBidPrice);
        }
      }
    }
    if (incoming.getQuantity() > 0) {
      asks.computeIfAbsent(incoming.getPrice(), k -> new ArrayDeque<>()).addLast(incoming);
    }
    return trades;
  }

  public List<PriceLevel> topBids(int depth) {
    return aggregate(bids, depth);
  }

  public List<PriceLevel> topAsks(int depth) {
    return aggregate(asks, depth);
  }

  private List<PriceLevel> aggregate(NavigableMap<Long, Deque<Order>> book, int depth) {
    List<PriceLevel> levels = new ArrayList<>();
    for (var entry : book.entrySet()) {
      long price = entry.getKey();
      long qty = 0;
      for (Order order : entry.getValue()) {
        qty += order.getQuantity();
      }
      levels.add(new PriceLevel(price, qty));
      if (levels.size() >= depth) {
        break;
      }
    }
    return levels;
  }

  private String tradeId() {
    return "T" + tradeSequence.getAndIncrement();
  }
}
