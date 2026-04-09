# Teams POC

Team planning workspace for modeling squads, members, projects, and allocation pressure. This POC is useful because it turns a common management problem into a system with explicit rules: capacity limits, utilization ceilings, and a dashboard that shows where a team is overloaded.

## Why This POC Matters

Many product and platform teams eventually need some version of this system internally. The interesting part is not basic CRUD. It is the rule enforcement around headcount, project staffing, and over-allocation.

## What You Can Explore

- Create teams with a mission and explicit capacity
- Add members with role, location, and skill metadata
- Create projects with goals and status
- Allocate members to projects with percentage-based assignments
- Inspect dashboard metrics such as headcount, active projects, and average utilization

## Architecture At A Glance

- `backend/` is a Spring Boot REST API with in-memory storage
- `frontend/` is a React dashboard for team management and reporting
- Validation happens at the API layer and in the service rules
- The backend seeds starter data so the UI has something to explore immediately

## Run It Locally

### Backend

```bash
cd teams-poc/backend
mvn spring-boot:run
```

Backend runs on `http://localhost:8105`.

### Frontend

```bash
cd teams-poc/frontend
npm install
npm start
```

Frontend runs on `http://localhost:3000`.

## Good Demo Flow

1. Open the seeded team and inspect the dashboard.
2. Add a new member and confirm headcount changes.
3. Create a new project and assign a team member to it.
4. Push allocations high enough to see utilization rules become relevant.

## API Surface

- `GET /api/teams`
- `POST /api/teams`
- `GET /api/teams/{teamId}/dashboard`
- `POST /api/teams/{teamId}/members`
- `PUT /api/teams/{teamId}/members/{memberId}`
- `POST /api/teams/{teamId}/projects`
- `POST /api/teams/{teamId}/assignments`

## Design Notes

- Capacity is enforced at the team level.
- Member allocation is capped so the same person cannot be silently overcommitted.
- Everything is stored in memory, which keeps the focus on rules and interaction flow instead of persistence concerns.

## Limitations

- No persistence or authentication
- No historical staffing timeline
- No skill matching or recommendation logic
- Single-user demo model rather than a collaborative planning tool

## Related Docs

- [TECHNICAL_README.md](TECHNICAL_README.md)
