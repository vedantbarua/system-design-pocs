# Ad Click Aggregator POC

A minimal ad-click aggregation service with a React UI. The backend ingests click events and returns summary + time-series rollups by campaign, ad, or publisher.

## What’s inside
- Spring Boot API with in-memory event store and aggregation endpoints
- React + Vite dashboard for ingesting clicks and exploring rollups

## How to Run

### Backend
1. Ensure Java 17+ and Maven are installed.
2. From this directory:
   ```bash
   mvn spring-boot:run
   ```
3. API runs at `http://localhost:8110`.

### Frontend
1. In another terminal:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
2. Open `http://localhost:5173`.

## API Endpoints

### Ingest a click
```bash
curl -X POST http://localhost:8110/api/clicks \
  -H "Content-Type: application/json" \
  -d '{
    "adId": "AD-001",
    "campaignId": "CMP-ALPHA",
    "publisherId": "PUB-NORTH",
    "occurredAt": "2026-02-01T15:30:00Z",
    "costCents": 25
  }'
```

### Seed random clicks
```bash
curl -X POST "http://localhost:8110/api/clicks/seed?count=120"
```

### Overview
```bash
curl "http://localhost:8110/api/overview?from=2026-02-01T00:00:00Z&to=2026-02-02T00:00:00Z"
```

### Summary
```bash
curl "http://localhost:8110/api/summary?groupBy=campaign"
```

### Time series
```bash
curl "http://localhost:8110/api/timeseries?groupBy=publisher&interval=hour"
```

## Notes
- Timestamps use ISO-8601 (UTC), e.g. `2026-02-01T15:30:00Z`.
- Data is in-memory and resets when the backend restarts.
