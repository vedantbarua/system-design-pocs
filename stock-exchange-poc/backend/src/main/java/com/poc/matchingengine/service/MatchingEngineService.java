package com.poc.matchingengine.service;

import com.poc.matchingengine.api.MarketStateResponse;
import com.poc.matchingengine.api.MarketUpdate;
import com.poc.matchingengine.api.OrderRequest;
import com.poc.matchingengine.api.OrderResponse;
import com.poc.matchingengine.engine.CommandEvent;
import com.poc.matchingengine.engine.CommandType;
import com.poc.matchingengine.engine.MatchingEngine;
import com.poc.matchingengine.engine.RingBufferQueue;
import com.poc.matchingengine.model.Order;
import com.poc.matchingengine.model.OrderBookSnapshot;
import com.poc.matchingengine.model.OrderType;
import com.poc.matchingengine.model.Trade;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

@Service
public class MatchingEngineService {
  private final RingBufferQueue<CommandEvent> ringBuffer;
  private final MatchingEngine engine;
  private final SimpMessagingTemplate messagingTemplate;
  private final AtomicLong orderSequence = new AtomicLong(1);
  private final AtomicLong lastProcessedSequence = new AtomicLong(-1);
  private final Map<String, OrderBookSnapshot> lastSnapshot = new ConcurrentHashMap<>();
  private final Map<String, Deque<Trade>> recentTrades = new ConcurrentHashMap<>();
  private final int recentTradeDepth = 20;
  private volatile boolean running = true;
  private final Thread engineThread;

  public MatchingEngineService(
      SimpMessagingTemplate messagingTemplate,
      @Value("${engine.ring-buffer-size:65536}") int ringBufferSize,
      @Value("${engine.top-levels:5}") int topLevels) {
    this.messagingTemplate = messagingTemplate;
    this.ringBuffer = new RingBufferQueue<>(ringBufferSize);
    this.engine = new MatchingEngine(topLevels, this::publishMarketData);
    this.engineThread = new Thread(this::runLoop, "matching-engine-thread");
  }

  @PostConstruct
  public void start() {
    engineThread.start();
  }

  @PreDestroy
  public void stop() {
    running = false;
    engineThread.interrupt();
  }

  public OrderResponse placeOrder(OrderRequest request) {
    String orderId = "O" + orderSequence.getAndIncrement();
    Order order = new Order(
        orderId,
        request.getSymbol().toUpperCase(),
        request.getSide(),
        OrderType.LIMIT,
        request.getPrice(),
        request.getQuantity(),
        Instant.now());

    long sequence = ringBuffer.next();
    order.setSequence(sequence);
    ringBuffer.publish(sequence, new CommandEvent(CommandType.PLACE_ORDER, order));

    return new OrderResponse(orderId, sequence);
  }

  public long currentSequence() {
    return lastProcessedSequence.get();
  }

  public MarketStateResponse marketState(String symbol) {
    String key = symbol.toUpperCase();
    OrderBookSnapshot snapshot = lastSnapshot.get(key);
    Deque<Trade> trades = recentTrades.getOrDefault(key, new ArrayDeque<>());
    return new MarketStateResponse(snapshot, List.copyOf(trades));
  }

  private void runLoop() {
    long nextSequence = 0L;
    while (running) {
      CommandEvent event = ringBuffer.waitFor(nextSequence);
      if (event == null) {
        if (!running) {
          break;
        }
        continue;
      }
      if (event != null && event.getType() == CommandType.PLACE_ORDER) {
        engine.handleOrder(event.getOrder());
        lastProcessedSequence.set(nextSequence);
      }
      ringBuffer.markConsumed(nextSequence);
      nextSequence++;
    }
  }

  private void publishMarketData(OrderBookSnapshot snapshot, List<Trade> trades) {
    lastSnapshot.put(snapshot.getSymbol(), snapshot);
    if (!trades.isEmpty()) {
      Deque<Trade> queue = recentTrades.computeIfAbsent(snapshot.getSymbol(), k -> new ArrayDeque<>());
      for (Trade trade : trades) {
        queue.addFirst(trade);
        if (queue.size() > recentTradeDepth) {
          queue.removeLast();
        }
      }
    }
    MarketUpdate update = new MarketUpdate(snapshot, trades);
    messagingTemplate.convertAndSend("/topic/market/" + snapshot.getSymbol(), update);
  }
}
