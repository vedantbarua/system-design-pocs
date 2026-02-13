# Workout Tracker POC

A workout + meal logging proof of concept. The backend stores workout sessions and meals in memory and exposes calorie overview stats. The React UI provides quick logging and a live dashboard.

## What’s inside
- Spring Boot API with in-memory workout + meal store
- Calorie overview endpoint for net balance
- React + Vite dashboard for logging and browsing entries

## How to Run

### Backend
1. Ensure Java 17+ and Maven are installed.
2. From this directory:
   ```bash
   mvn spring-boot:run
   ```
3. API runs at `http://localhost:8111`.

### Frontend
1. In another terminal:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
2. Open `http://localhost:5173`.

## API Endpoints

### Log a workout
```bash
curl -X POST http://localhost:8111/api/workouts \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Tempo Run",
    "category": "Cardio",
    "durationMinutes": 45,
    "caloriesBurned": 420,
    "occurredAt": "2026-02-10T15:30:00Z"
  }'
```

### Log a meal
```bash
curl -X POST http://localhost:8111/api/meals \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Salmon Bowl",
    "mealType": "Dinner",
    "calories": 620,
    "occurredAt": "2026-02-10T19:10:00Z"
  }'
```

### Overview
```bash
curl http://localhost:8111/api/overview
```

### List workouts
```bash
curl http://localhost:8111/api/workouts
```

### List meals
```bash
curl http://localhost:8111/api/meals
```

### Seed demo data
```bash
curl -X POST "http://localhost:8111/api/workouts/seed?count=8"
curl -X POST "http://localhost:8111/api/meals/seed?count=8"
```

## Notes
- All timestamps use ISO-8601 (UTC), e.g. `2026-02-10T15:30:00Z`.
- Data is in-memory and resets when the backend restarts.
