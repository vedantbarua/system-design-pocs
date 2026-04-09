# Stock Exchange / Matching Engine POC

Low-latency matching engine proof-of-concept built around sequenced ingress, a single-threaded deterministic matcher, and live order-book updates over REST plus WebSocket. This is one of the strongest systems-heavy projects in the repo because it makes ordering guarantees and deterministic execution concrete.

## Why This POC Matters

Matching engines are a good example of a system where correctness and ordering matter more than horizontal request handling. The interesting design choice is separating ordered ingress from the core matcher so the book itself stays deterministic without heavy locking.

## What It Covers

- Monotonic sequence assignment at ingress
- Ring-buffer style command flow into the engine
- Single-threaded matching with price-time priority
- In-memory order books by symbol
- REST APIs for order entry and snapshots
- WebSocket fanout for live market updates and trades
- React UI for placing orders and watching the book move in real time

## Quick Start

### Backend

```bash
cd stock-exchange-poc/backend
mvn spring-boot:run
```

Backend runs on `http://localhost:8080`.

### Frontend

```bash
cd stock-exchange-poc/frontend
npm install
npm start
```

Frontend runs on `http://localhost:3000`.

## Good Demo Flow

1. Submit a buy order for `ACME`.
2. Submit a sell order that crosses the book.
3. Watch the trade appear and the sequence number increase.
4. Change the symbol and observe that each book is tracked independently.

## API And Realtime Surface

- `POST /api/orders` with `{ symbol, side, price, quantity }`
- `GET /api/market/{symbol}`
- `GET /api/engine/sequence`
- WebSocket endpoint: `/ws`
- Topic: `/topic/market/{SYMBOL}`
- Swagger UI: `/swagger-ui`
- OpenAPI JSON: `/api-docs`

## Configuration

- Backend config lives in `backend/src/main/resources/application.yml`
- Default backend port is `8080`
- The ring buffer size defaults to `65536`

## Design Notes

- Sequence numbers are assigned before matching so execution order is explicit.
- A single consumer thread keeps matching deterministic and avoids lock contention inside the order book.
- The current design is a good stepping stone toward WAL, replay, and partitioned engines.

## Limitations

- No persistence or replay yet
- No cancel or replace flow
- No account-level risk checks
- HTTP plus SockJS instead of a lower-latency binary entry path

## Related Docs

- [TECHNICAL_DOC.md](TECHNICAL_DOC.md)
- [IMPROVEMENTS.md](IMPROVEMENTS.md)
