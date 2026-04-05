# Distributed Log Monitoring and Alerting System POC

Spring Boot and React proof-of-concept for a centralized log-ingestion pipeline that normalizes events, scrubs PII, applies rule-based alerting, and exposes recent logs plus triggered alerts through a small control plane.

## Goal

Demonstrate how an operations system can ingest application logs, transform them through a processing pipeline, and trigger alerts based on reusable filtering rules rather than hard-coded endpoint logic.

## What It Covers

- Centralized log ingestion through a Spring Boot API
- Chain-of-responsibility transformation pipeline
- PII scrubbing for sensitive message content
- Timestamp normalization and metadata enrichment
- Strategy-based alert filters with threshold counters
- Observer-style alert sinks for console output and in-memory dashboard state
- React UI for sending logs, viewing recent events, and clearing alerts

## Quick Start

1. Start the server:
   ```bash
   cd distributed-log-monitoring-and-alerting-system-poc/server
   mvn spring-boot:run
   ```
2. Start the client:
   ```bash
   cd distributed-log-monitoring-and-alerting-system-poc/client
   npm install
   npm run dev
   ```
3. Open `http://localhost:5173`.

## UI Flows

- Send a single log entry and inspect the normalized stored result
- Send a sample burst to trip threshold-based alert rules
- Submit messages with email or card-like text and observe PII scrubbing
- Clear active alerts while keeping the recent log history visible

## JSON Endpoints

- `POST /api/logs`
- `GET /api/logs`
- `GET /api/alerts`
- `DELETE /api/alerts`

Example log request:

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

## Configuration

- the Spring server runs on its configured application port
- the Vite client runs on `5173`
- the in-memory log store retains the most recent `200` entries
- alert rules are registered in code during application startup

## Notes and Limitations

- Storage is fully in memory and resets on restart.
- Alert thresholds are global counters and are not partitioned by tenant, service, or time window.
- The pipeline models synchronous ingestion rather than a queue-backed or stream-based log path.
- There is no persistent retention tier, indexing layer, or search API.

## Technologies Used

- Spring Boot
- Java 17
- React
- Vite
- In-memory processing pipeline and alert store
