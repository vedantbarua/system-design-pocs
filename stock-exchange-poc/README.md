# Stock Exchange / Matching Engine POC

A low-latency matching engine POC emphasizing:
- Sequenced ring buffer ingestion (Disruptor-style)
- Single-threaded deterministic matching
- In-memory order book + market data via REST + WebSocket

## Structure
- `backend`: Spring Boot API + matching engine
- `frontend`: Create React App UI

## Run backend
```bash
cd /Users/vedantbarua/Desktop/Projects/system-design-pocs/stock-exchange-poc/backend
mvn mvn spring-boot:run
```

## Run frontend
```bash
cd /Users/vedantbarua/Desktop/Projects/system-design-pocs/stock-exchange-poc/frontend
npm install
npm start
```

## API
- `POST /api/orders` `{ symbol, side, price, quantity }`
- `GET /api/market/{symbol}` initial snapshot + recent trades
- `GET /api/engine/sequence` last processed sequence

## Swagger / OpenAPI
- Swagger UI: `/swagger-ui`
- OpenAPI JSON: `/api-docs`

## Technical Doc
- See `TECHNICAL_DOC.md`

## WebSocket
- Connect to `/ws` (SockJS)
- Subscribe to `/topic/market/{SYMBOL}` for live updates

## Notes
This POC is intentionally in-memory for speed and determinism. Sequence numbers are assigned at ingestion and carried through order book updates/trades for recovery replay if you add a WAL later.
