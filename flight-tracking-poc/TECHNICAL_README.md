# Technical README: Flight Tracking POC

## Overview
This POC models a simplified flight tracking system. The backend exposes flights, airports, and a derived track feed that simulates position, altitude, and speed. The frontend renders an operations console with filters, live refresh, and a route visualization.

## Architecture

```
React (Vite)
  -> GET /api/airports
  -> GET /api/flights
  -> GET /api/flights/{id}
  -> GET /api/flights/{id}/track

Spring Boot
  -> FlightTrackingController
  -> FlightTrackingService (in-memory airports + flights)
```

### Backend
- Spring Boot 3.2 (Java 17)
- REST endpoints returning JSON
- In-memory seed data (airports + flights)
- Track engine computes progress, position, altitude, and distance

### Frontend
- React 18 + Vite
- Flight feed with search + status filters
- Detail panel with simulated route visualization
- Auto-refresh of tracking data every 5 seconds

## Runtime Flow
1. React loads airports and the current flight feed.
2. Selecting a flight calls `/api/flights/{id}/track` to receive the current simulated position.
3. The UI refreshes the track every 5 seconds to keep metrics and the route visualization current.

## Backend Details

### Endpoints
- `GET /api/airports` → list airports
- `GET /api/flights` → list flights with optional `query`, `status`, `origin`, `destination`
- `GET /api/flights/{id}` → flight detail
- `GET /api/flights/{id}/track` → current track and path points

### Core Classes
- `FlightTrackingService` — seed data + tracking calculations
- `FlightTrackingController` — REST endpoints
- `Airport`, `Flight` — data models
- `Position`, `FlightTrackResponse` — track output

## Data Models

### Airport
- `code: String`
- `name: String`
- `city: String`
- `country: String`
- `latitude: double`
- `longitude: double`
- `timezone: String`

### Flight
- `id: long`
- `flightNumber: String`
- `airline: String`
- `origin: String`
- `destination: String`
- `aircraft: String`
- `status: String`
- `scheduledDeparture: Instant`
- `scheduledArrival: Instant`
- `estimatedDeparture: Instant`
- `estimatedArrival: Instant`
- `gate: String`
- `terminal: String`

### Position
- `latitude: double`
- `longitude: double`
- `altitudeFeet: int`
- `speedKts: int`
- `heading: int`
- `timestamp: Instant`

### FlightTrackResponse
- `flightId: long`
- `flightNumber: String`
- `status: String`
- `progress: double`
- `lastUpdated: Instant`
- `currentPosition: Position`
- `path: List<Position>`
- `distanceTotalMiles: double`
- `distanceRemainingMiles: double`
- `estimatedArrival: Instant`

## Local Development

### Backend
```
cd /Users/vedantbarua/Desktop/Projects/system-design-pocs/flight-tracking-poc
mvn spring-boot:run
```

### Frontend
```
cd /Users/vedantbarua/Desktop/Projects/system-design-pocs/flight-tracking-poc/frontend
npm install
npm run dev
```

## Notes
- Tracking data is simulated and deterministic per flight ID.
- Distance is computed using a Haversine approximation.
- Data resets on restart.
