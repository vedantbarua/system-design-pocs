# Technical README: Workout Tracker POC

## Overview
This POC demonstrates a **dual-ledger** flow: workouts burn calories, meals consume calories, and the system computes a net calorie balance across a time range. The backend is a Spring Boot REST API with an in-memory store. The frontend is a React + Vite UI for quick logging and review.

## Architecture

```
React (Vite)
  -> POST /api/workouts
  -> POST /api/meals
  -> GET  /api/workouts
  -> GET  /api/meals
  -> GET  /api/overview

Spring Boot (Controller)
  -> WorkoutTrackerService (in-memory maps)
  -> returns sorted lists + overview totals
```

### Backend
- Spring Boot 3.2 (Java 17)
- REST + validation (Jakarta)
- In-memory data store (ConcurrentHashMap)

### Frontend
- React 18 + Vite
- Single-page dashboard
- Manual refresh + seed actions

## Runtime Flow
1. User submits a workout or meal in the UI.
2. React posts JSON to the backend.
3. The service stores the entry and recalculates overview totals on request.
4. UI refreshes lists and summary cards.

## Backend Details

### Endpoints
- `POST /api/workouts` → add workout
- `GET /api/workouts` → list workouts
- `DELETE /api/workouts/{id}` → remove workout
- `POST /api/workouts/seed` → create random workouts
- `POST /api/meals` → add meal
- `GET /api/meals` → list meals
- `DELETE /api/meals/{id}` → remove meal
- `POST /api/meals/seed` → create random meals
- `GET /api/overview` → calorie balance summary

### Core Classes
- `WorkoutTrackerService` — in-memory store, totals, seeding
- `WorkoutTrackerController` — REST endpoints and timestamp parsing
- `WorkoutEntry` / `MealEntry` — record models

## Data Models

### WorkoutEntry
- `id: long`
- `name: String`
- `category: String`
- `durationMinutes: int`
- `caloriesBurned: int`
- `occurredAt: Instant`

### MealEntry
- `id: long`
- `name: String`
- `mealType: String`
- `calories: int`
- `occurredAt: Instant`

### CalorieOverview
- `workoutCount: int`
- `mealCount: int`
- `totalWorkoutMinutes: int`
- `caloriesBurned: int`
- `caloriesConsumed: int`
- `netCalories: int`

## Local Development

### Backend
```
cd /Users/vedantbarua/Desktop/Projects/system-design-pocs/workout-tracker-poc
mvn spring-boot:run
```

### Frontend
```
cd /Users/vedantbarua/Desktop/Projects/system-design-pocs/workout-tracker-poc/frontend
npm install
npm run dev
```

## Notes
- Entries are stored in memory only.
- Timestamp parsing expects ISO-8601 in UTC.
- CORS allows `http://localhost:5173` for development.
