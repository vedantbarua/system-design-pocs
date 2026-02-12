# Teams POC
Team management workspace for tracking people, projects, and allocation.

## What it does
- Create teams with a mission and capacity.
- Add members and projects.
- Assign people to projects with utilization limits.
- View a dashboard with headcount, active projects, and utilization.

## How to Run
1. Ensure you have Java 17+ and Maven installed.
2. Start the backend:
   - `cd teams-poc/backend`
   - `mvn spring-boot:run`
3. Start the frontend in another terminal:
   - `cd teams-poc/frontend`
   - `npm install && npm start`
4. Open `http://localhost:3000`

## API Overview
- `GET /api/teams`
- `POST /api/teams`
- `GET /api/teams/{teamId}/dashboard`
- `POST /api/teams/{teamId}/members`
- `PUT /api/teams/{teamId}/members/{memberId}`
- `POST /api/teams/{teamId}/projects`
- `POST /api/teams/{teamId}/assignments`

See `TECHNICAL_README.md` for architecture and flow details.
