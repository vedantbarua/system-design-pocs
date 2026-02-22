# Flight Tracking POC

A lightweight flight tracking dashboard with a Java Spring Boot backend and a React + Vite frontend. The POC simulates live flight positions, ETAs, and operational status for a handful of seeded routes.

## What’s inside
- Spring Boot REST API with in-memory airports and flights
- Tracking engine that computes live position, altitude, speed, and distance remaining
- React ops console with filters, live refresh, and route visualization

## How to Run

### Backend
1. Ensure Java 17+ and Maven are installed.
2. From this directory:
   ```bash
   mvn spring-boot:run
   ```
3. API runs at `http://localhost:8121`.

### Frontend
1. In another terminal:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
2. Open `http://localhost:5173`.

## API Endpoints

### List flights
```bash
curl "http://localhost:8121/api/flights"
```

### Filter flights
```bash
curl "http://localhost:8121/api/flights?query=UA&status=EN_ROUTE"
```

### Flight detail
```bash
curl "http://localhost:8121/api/flights/201"
```

### Live track
```bash
curl "http://localhost:8121/api/flights/201/track"
```

### Airports
```bash
curl "http://localhost:8121/api/airports"
```

## Notes
- All data is in-memory and resets on restart.
- The tracking engine is simulated and refreshes every 5 seconds in the UI.
- CORS allows `http://localhost:5173` for local development.

## Distributed Tracing (OpenTelemetry)
The backend emits OpenTelemetry spans and propagates `X-Trace-ID` per request. The UI displays the most recent trace ID and sends it on API calls.

### Run with Jaeger (OTLP gRPC)
1. Start Jaeger locally:
   ```bash
   docker run --rm -p 16686:16686 -p 4317:4317 jaegertracing/all-in-one:1.53
   ```
2. Run the backend with OTLP endpoint:
   ```bash
   OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317 mvn spring-boot:run
   ```
3. Open Jaeger UI at `http://localhost:16686`.

### Run with Zipkin (OTLP gRPC)
1. Start Zipkin:
   ```bash
   docker run --rm -p 9411:9411 -p 4317:4317 openzipkin/zipkin
   ```
2. Run the backend with OTLP endpoint:
   ```bash
   OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317 mvn spring-boot:run
   ```
3. Open Zipkin UI at `http://localhost:9411`.
