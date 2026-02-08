# Distributed Log Monitoring and Alerting System POC

This POC simulates a trading match engine log flow from client to server. Logs are collected, transformed through a pipeline, filtered via strategies, and finally dispatched to observers when alert thresholds are met.

## Architecture
- LogCollector (Singleton/Factory)
- Transformation Pipeline (Chain of Responsibility)
- Filter Engine (Strategy Pattern)
- Alerting Service (Observer Pattern)

## Run

### Server
```bash
cd /Users/vedantbarua/Desktop/Projects/system-design-pocs/distributed-log-monitoring-and-alerting-system-poc/server
mvn spring-boot:run
```

### Client
```bash
cd /Users/vedantbarua/Desktop/Projects/system-design-pocs/distributed-log-monitoring-and-alerting-system-poc/client
npm install
npm run dev
```

Open `http://localhost:5173`.

## Sample Log Payload
```json
{
  "source": "trading-gateway",
  "module": "matching-engine",
  "level": "ERROR",
  "message": "Trade rejected: insufficient margin",
  "originalTimestamp": "2026-02-08T12:00:00Z",
  "metadata": {
    "symbol": "AAPL",
    "orderId": "O-9912"
  }
}
```

## Alert Rules (Server)
- `errors_over_threshold`: triggers on 3+ ERROR logs
- `trade_rejected`: triggers on 2 occurrences of "trade rejected"
- `fatal_matching_engine`: triggers on any FATAL log containing "matching"
