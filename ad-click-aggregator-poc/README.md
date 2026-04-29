# Ad Click Aggregator POC

A minimal ad-click aggregation service with a React UI. The backend ingests click events and returns overview, summary, and time-series rollups by campaign, ad, or publisher.

## Goal

Show the core shape of an analytics ingestion and aggregation system: accept timestamped click events, retain them in an append-only in-memory store, and answer filtered aggregate queries across multiple dimensions.

## What It Covers

- Click ingestion with validation and server-side event IDs
- Time-window filtering with ISO-8601 timestamps
- Grouped rollups by campaign, ad, or publisher
- Minute, hour, and day buckets for time-series views
- Spend aggregation using integer cents
- Seed data generation for demoing dashboard behavior quickly
- React + Vite dashboard for ingesting clicks and exploring metrics

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

## Demo Flow

1. Start the backend and frontend.
2. Click **Seed 120 clicks** to create a synthetic 24-hour event set.
3. Switch the **Group by** selector between campaign, ad, and publisher.
4. Switch the interval between minute, hour, and day to see bucket granularity change.
5. Use the time filters to narrow the aggregation window.
6. Submit a custom click and refresh the rollups.

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

## Configuration

- Backend port: `server.port=8110`
- Frontend dev server: `http://localhost:5173`
- CORS allows `GET` and `POST` requests from the Vite dev origin.
- Jackson writes Java time values as ISO strings instead of numeric timestamps.

## Notes and Limitations

- Timestamps use ISO-8601 (UTC), e.g. `2026-02-01T15:30:00Z`.
- Data is in-memory and resets when the backend restarts.
- Aggregates are recalculated from the full filtered event list on each request.
- There is no authentication, tenant isolation, deduplication, or durable ingestion queue.

## Technologies Used

- Java 17
- Spring Boot 3.2
- Spring Web and Bean Validation
- React 18
- Vite 5

## More Detail

- [Technical README](TECHNICAL_README.md)
- [Improvements](IMPROVEMENTS.md)
