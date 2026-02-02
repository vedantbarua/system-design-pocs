# Technical Document: Stock Exchange / Matching Engine POC

## Goal
Provide a low-latency, deterministic matching engine POC with REST ingestion and WebSocket market data. Emphasis is on strict ordering via a sequenced ring buffer and single-threaded matching for determinism.

## Architecture Overview
- **Ingress**: REST `POST /api/orders` accepts limit orders.
- **Sequencing**: Orders are assigned a monotonic sequence as they enter the ring buffer.
- **Core Matching**: A single engine thread consumes in-order events and matches against an in-memory order book.
- **Market Data**: After each event, the engine publishes a snapshot + trades to `/topic/market/{SYMBOL}` via WebSocket.

## Components
- **RingBufferQueue**: Disruptor-style ring buffer with sequence tracking and backpressure.
- **MatchingEngine**: Routes orders to symbol-specific `OrderBook` and emits trades + snapshots.
- **OrderBook**: Price-time priority using price levels (TreeMap + FIFO queues per level).
- **API Service**: Coordinates ingestion, runs the engine thread, and retains latest snapshots/trades.

## Data Flow
1. Client submits order over REST.
2. Service assigns `sequence` and publishes to ring buffer.
3. Engine thread consumes next sequence, matches, and updates book.
4. Snapshot + trades are broadcast to WebSocket subscribers.

## Ordering & Determinism
- **Single consumer thread** ensures deterministic matching and avoids locking in the order book.
- **Sequence numbers** are assigned at ingress and are carried through to snapshots and trades.
- **Backpressure** is applied by the ring buffer when consumers lag.

## In-Memory POC Constraints
- No persistence or replay (yet). Sequence numbers make a WAL/replay straightforward.
- All data is stored in-memory per symbol.

## API Endpoints
- `POST /api/orders` — place order `{ symbol, side, price, quantity }`
- `GET /api/market/{symbol}` — current snapshot + recent trades
- `GET /api/engine/sequence` — last processed sequence

## WebSocket
- SockJS endpoint: `/ws`
- Subscribe: `/topic/market/{SYMBOL}`

## Swagger / OpenAPI
- Swagger UI: `/swagger-ui`
- OpenAPI JSON: `/api-docs`

## Next Enhancements
- Write-ahead log (WAL) and replay
- Cancel/replace, risk checks, and multi-venue routing
- Binary TCP gateway for lower latency ingestion
