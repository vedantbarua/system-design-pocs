# Stock Exchange / Matching Engine Technical README

## Problem Statement

This POC models a small stock exchange matching engine where correctness depends on processing orders in one deterministic sequence. The goal is not to maximize HTTP throughput; it is to make the core tradeoff visible: order ingress can be concurrent, but the book mutation path must preserve price-time priority and replayable ordering.

The implementation demonstrates a sequenced in-memory command queue, a single matching thread, symbol-specific order books, REST order entry, and WebSocket market-data fanout.

## Architecture Overview

The backend is a Spring Boot service with four main layers:

- `OrderController` exposes REST endpoints for order entry, market snapshots, and engine sequence state.
- `MatchingEngineService` assigns order IDs, reserves ring-buffer sequences, publishes commands, owns the engine thread, and stores latest market state.
- `RingBufferQueue` is a bounded power-of-two command queue that gives each command a monotonic sequence and applies producer backpressure when the consumer falls behind.
- `MatchingEngine` routes orders to an `OrderBook` per symbol and publishes snapshots plus trades after each processed command.

The frontend is a React app that submits orders over REST, reads an initial market snapshot, and subscribes to `/topic/market/{SYMBOL}` using STOMP over SockJS.

## Core Data Model

- `Order`: limit order with `orderId`, `symbol`, `side`, `price`, remaining `quantity`, timestamp, and assigned engine `sequence`.
- `OrderBook`: per-symbol in-memory book with bids sorted high-to-low and asks sorted low-to-high.
- `PriceLevel`: aggregated visible quantity at a price.
- `Trade`: execution event containing trade ID, buyer order ID, seller order ID, execution price, quantity, and engine sequence.
- `OrderBookSnapshot`: top bid and ask levels for a symbol after an order is processed.
- `MarketUpdate`: WebSocket payload containing the latest snapshot and any trades produced by the order.

Prices and quantities are represented as integers to avoid floating-point behavior in matching logic.

## Request And Event Flow

1. A client posts a limit order to `POST /api/orders`.
2. `MatchingEngineService` creates an order ID, normalizes the symbol, and reserves the next ring-buffer sequence.
3. The service writes a `PLACE_ORDER` command into the ring buffer and returns the accepted order ID plus sequence.
4. The single engine thread waits for the next sequence, consumes commands in order, and passes each order to `MatchingEngine`.
5. `MatchingEngine` selects the symbol book and calls `OrderBook.process`.
6. The order book matches against the opposite side until the order is filled or no crossing price remains.
7. Any residual quantity rests at the incoming price level.
8. The engine publishes the new top-of-book snapshot and trades.
9. `MatchingEngineService` records the latest snapshot, keeps the most recent trades, advances `lastProcessedSequence`, and broadcasts a WebSocket update.

## Matching Rules

The order book implements price-time priority:

- Buy orders match the lowest ask when `buy.price >= bestAsk`.
- Sell orders match the highest bid when `sell.price <= bestBid`.
- Resting orders at the same price are stored in FIFO queues.
- A partial fill leaves the remaining quantity on the incoming or resting order.
- Unfilled incoming quantity is added to the book at its limit price.

The execution price is the resting order's price. Buy aggressors execute at the best ask. Sell aggressors execute at the best bid.

## Ordering And Determinism

The main correctness mechanism is the ordered handoff from REST ingress to the matching thread.

- `RingBufferQueue.next()` reserves a unique sequence using an atomic counter.
- Producers publish the command at `sequence & mask`, where the mask requires a power-of-two queue size.
- The engine thread only processes the next expected sequence.
- Book mutation happens on that one thread, so `OrderBook` does not need internal locks.
- Snapshots and trades carry the sequence that caused them, making execution order visible to clients.

This is intentionally close to the structure used by production matching systems: fast ingress, ordered command processing, deterministic state mutation, and market-data publication after the state transition.

## Failure Handling

This POC has explicit in-memory limits:

- If the engine consumer falls behind, producers spin briefly in `RingBufferQueue.next()` until space is available.
- If the process restarts, all books, recent trades, and sequence state are lost.
- WebSocket clients can recover the latest visible state by calling `GET /api/market/{symbol}` after reconnecting.
- There is no durable audit log, so accepted orders cannot be replayed after a crash.

The existing sequence assignment makes the natural production next step clear: append each accepted command to a write-ahead log before publishing it to the ring buffer, then replay that log on startup.

## API Surface

- `POST /api/orders`: accepts `{ "symbol": "ACME", "side": "BUY", "price": 100, "quantity": 10 }` and returns `{ "orderId": "...", "sequence": 0 }`.
- `GET /api/market/{symbol}`: returns the latest snapshot and recent trades for a symbol.
- `GET /api/engine/sequence`: returns the last processed engine sequence.
- `GET /swagger-ui`: interactive OpenAPI UI.
- `GET /api-docs`: OpenAPI JSON.

## Realtime Surface

- SockJS endpoint: `/ws`
- STOMP topic: `/topic/market/{SYMBOL}`
- Payload: `MarketUpdate`, containing `snapshot` and `trades`

The frontend subscribes per selected symbol and also fetches a REST snapshot when the symbol changes.

## Key Tradeoffs

- Single-threaded matching favors determinism over raw parallelism.
- Per-symbol books are isolated in memory, but this implementation runs all symbols through one engine thread.
- Integer prices simplify matching and avoid decimal precision issues.
- REST and SockJS are easy to demo, but they add overhead compared with binary gateways and native market-data protocols.
- Recent trades are retained in memory for UI readability, not as a durable trade store.

## Scaling Path

A production version would scale by keeping determinism inside each partition:

- Partition symbols across multiple matching-engine instances.
- Route orders by symbol at the gateway layer.
- Persist accepted commands to a WAL before matching.
- Snapshot order books periodically to reduce replay time.
- Publish market data through a broker or purpose-built fanout service.
- Add risk checks before sequence assignment or as a deterministic pre-match command.
- Use low-latency transport for order entry and market-data subscribers.

## What Is Intentionally Simplified

- Only limit orders are implemented.
- There is no cancel, replace, market order, stop order, or time-in-force handling.
- There are no accounts, balances, positions, or pre-trade risk limits.
- There is no persistence, replay, snapshot recovery, or cross-engine replication.
- There is no test suite yet for price-time priority, partial fills, or replay determinism.
- The frontend is a demo console, not a trading terminal.
