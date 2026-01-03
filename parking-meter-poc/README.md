Parking Meter POC
=================

Spring Boot proof-of-concept for the classic parking meter coding interview problem. It exposes a tiny UI and API to add quarters, tick time forward, and watch expiration.

Features
--------
- Single in-memory parking meter with configurable `maxMinutes` and `minutesPerQuarter`.
- UI for inserting quarters, advancing minutes, and ticking one minute.
- JSON endpoint for meter state (`/api/meter`).
- Configurable defaults in `application.properties`.

Quick Start
-----------
1. Ensure Java 17+ and Maven are installed.
2. Run the app:
   ```bash
   cd parking-meter-poc
   mvn org.springframework.boot:spring-boot-maven-plugin:run
   ```
3. Open `http://localhost:8081` to try the UI. API at `http://localhost:8081/api/meter`.

Endpoints
---------
- `/` GET: View meter status and controls.
- `/insert` POST: Body param `quarters` to add time.
- `/advance` POST: Body param `minutes` to fast-forward.
- `/tick` POST: Tick one minute.
- `/api/meter` GET: JSON state.

Config knobs
------------
- `meter.max-minutes` (default 120)
- `meter.minutes-per-quarter` (default 15)
- `server.port` (default 8081)

See TECHNICAL_README.md for file-by-file breakdown and IMPROVEMENTS.md for next steps.
