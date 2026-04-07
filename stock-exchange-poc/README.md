# Stock Exchange / Matching Engine POC

Low-latency matching-engine proof-of-concept built around sequenced ingress, a single-threaded deterministic matcher, and live order-book updates over REST plus WebSocket.

## Goal

Demonstrate why high-throughput exchanges often separate ordered ingress from matching logic, and how sequence numbers plus single-threaded matching can keep execution deterministic without locking the order book itself.

## What It Covers

- Ring-buffer style order ingestion with monotonic sequence assignment
- Single-threaded matching for deterministic execution
- In-memory order books with price-time priority
- REST order entry and market snapshot APIs
- WebSocket broadcasting of book updates and trades
- UI for watching market state change in real time

## Quick Start

1. Start the backend:
   ```bash
   cd stock-exchange-poc/backend
   mvn spring-boot:run
   ```
2. Start the frontend:
   ```bash
   cd stock-exchange-poc/frontend
   npm install
   npm start
   ```
3. Open the frontend at its local CRA dev-server URL.

## UI Flows

- Submit buy and sell orders for the same symbol
- Watch trades appear as crossing prices execute
- Inspect the updated order book and latest trades
- Observe the engine sequence increase as each order is processed

## JSON Endpoints

- `POST /api/orders` body: `{ symbol, side, price, quantity }`
- `GET /api/market/{symbol}`
- `GET /api/engine/sequence`

## WebSocket

- Connect to `/ws` through SockJS
- Subscribe to `/topic/market/{SYMBOL}` for live market updates

## Configuration

- backend configuration lives under `backend/src/main/resources/application.yml`
- the frontend is a Create React App application under `frontend/`
- the engine runs fully in memory with no replay or persistence

## Notes and Limitations

- All order books, trades, and engine state are in memory and reset on restart.
- Only a simplified order-entry path is modeled; cancel/replace and risk checks are not implemented here.
- Sequence numbers make WAL-style replay straightforward, but no persistence layer exists in this POC.

## Technologies Used

- Spring Boot
- Java
- React
- SockJS / WebSocket

## Technical Doc

- See `TECHNICAL_DOC.md`
