# Trading Log POC

Spring Boot proof-of-concept for a trading blotter: ingest executions, maintain net positions, update market marks, and surface realized and unrealized P&L with lightweight alerts.

## Features
- Trade ingestion for buys and sells
- Per-symbol net position tracking
- Weighted-average cost basis for open inventory
- Realized and unrealized P&L calculation
- Market price updates for mark-to-market views
- Alerting for missing marks, large exposure, and drawdown thresholds
- Thymeleaf dashboard plus JSON endpoints
- In-memory state that resets on restart

## Quick Start
1. Ensure Java 17+ and Maven are installed.
2. Run the app:
   ```bash
   cd resilient-flow-poc
   mvn org.springframework.boot:spring-boot-maven-plugin:run
   ```
3. Open `http://localhost:8108`.

## Endpoints
- `/` - dashboard UI
- `/trades` `POST` - log a trade from the form
- `/prices` `POST` - update a market price from the form
- `/api/trades` `GET` - list trades
- `/api/trades` `POST` - create a trade as JSON
- `/api/positions` `GET` - list computed positions
- `/api/positions/{symbol}` `GET` - fetch one symbol position
- `/api/summary` `GET` - portfolio summary
- `/api/alerts` `GET` - current alerts
- `/api/prices` `GET` - market prices
- `/api/prices` `POST` - update a market price as JSON

## Example Requests
```bash
curl -X POST http://localhost:8108/api/trades \
  -H "Content-Type: application/json" \
  -d '{
    "symbol":"META",
    "side":"BUY",
    "quantity":35,
    "price":492.10,
    "trader":"Vedant",
    "venue":"NASDAQ"
  }'
```

```bash
curl -X POST http://localhost:8108/api/prices \
  -H "Content-Type: application/json" \
  -d '{
    "symbol":"META",
    "marketPrice":499.25
  }'
```

## Notes
- Symbols are normalized to uppercase.
- Symbol format allows `A-Z`, digits, `.`, `:`, and `-`, up to 12 characters.
- Gross exposure alert fires at `$100,000`.
- Loss alert fires at `-$1,000` total P&L.

## Technologies
- Spring Boot 3.2
- Java 17
- Thymeleaf
- Jakarta Validation
