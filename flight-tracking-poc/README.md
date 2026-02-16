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
