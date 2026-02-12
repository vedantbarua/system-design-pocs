# Technical README: Teams POC

This document explains the architecture, flow, and file-by-file purpose of the teams proof-of-concept.

## Architecture Overview
- **Framework**: Spring Boot 3.3 REST API + Create React App UI.
- **Storage**: In-memory collections per team (members, projects, assignments).
- **Domain**:
  - `Team` for squad-level ownership, mission, and capacity.
  - `Member` for people on the team.
  - `Project` for initiatives with status and goal.
  - `Assignment` for allocation of a member to a project.
- **Service**: `TeamService` manages CRUD and utilization rules.
- **Controllers**: `TeamsController` exposes API endpoints; `WebConfig` provides CORS.

## Core Data Model
- **Team**: `id`, `name`, `mission`, `capacity`, `createdAt`
- **Member**: `id`, `name`, `role`, `location`, `status`, `skills`, `createdAt`
- **Project**: `id`, `name`, `goal`, `status`, `createdAt`
- **Assignment**: `id`, `memberId`, `projectId`, `allocationPercent`, `createdAt`

## File Structure
```
teams-poc/
├── README.md
├── TECHNICAL_README.md
├── backend/
│   ├── pom.xml
│   └── src/main/
│       ├── java/com/poc/teams/
│       │   ├── TeamsApplication.java
│       │   ├── api/
│       │   │   ├── TeamsController.java
│       │   │   ├── WebConfig.java
│       │   │   ├── *Request/Response DTOs
│       │   ├── model/
│       │   │   ├── Team.java
│       │   │   ├── Member.java
│       │   │   ├── Project.java
│       │   │   ├── Assignment.java
│       │   │   ├── MemberStatus.java
│       │   │   └── ProjectStatus.java
│       │   └── service/
│       │       └── TeamService.java
│       └── resources/
│           └── application.properties
└── frontend/
    ├── package.json
    ├── public/index.html
    └── src/
        ├── App.js
        ├── App.css
        └── index.js
```

## Flow
1. **Teams**: `GET /api/teams` lists teams; `POST /api/teams` creates one.
2. **Members**: `POST /api/teams/{teamId}/members` adds a person.
3. **Projects**: `POST /api/teams/{teamId}/projects` creates a project.
4. **Assignments**: `POST /api/teams/{teamId}/assignments` allocates a member to a project.
5. **Dashboard**: `GET /api/teams/{teamId}/dashboard` returns members, projects, assignments, and metrics.

## API Details
- **Create team**: `POST /api/teams` `{ "name": "Atlas", "mission": "Platform reliability", "capacity": 8 }`
- **Add member**: `POST /api/teams/{teamId}/members` `{ "name": "Riya", "role": "Tech Lead", "location": "Toronto", "skills": ["Reliability"] }`
- **Add project**: `POST /api/teams/{teamId}/projects` `{ "name": "Latency Drop", "goal": "Reduce p99 by 20%", "status": "ACTIVE" }`
- **Add assignment**: `POST /api/teams/{teamId}/assignments` `{ "memberId": "...", "projectId": "...", "allocationPercent": 60 }`
- **Update member**: `PUT /api/teams/{teamId}/members/{memberId}` `{ "role": "Staff Engineer", "status": "ON_LEAVE" }`
- **Dashboard response**: includes `metrics` with headcount, active projects, total assignments, and average utilization.

## Notable Implementation Details
- **Capacity enforcement**: teams cannot exceed the configured capacity.
- **Utilization checks**: a member cannot exceed 120% allocation across projects.
- **Seed data**: the service seeds one team, members, projects, and assignments for immediate exploration.
- **Metrics**: average utilization is computed from current assignments.
- **Validation**: request payloads are validated via Jakarta annotations.
- **Errors**: missing resources or rule violations return `400` with an error message.

## Frontend Notes
- React app fetches teams on load and a dashboard whenever a team is selected.
- Forms allow creating teams, members, projects, and assignments.
- Dashboard cards show metrics and lists of members, projects, and allocations.

## Configuration
- `server.port=8105` — avoid collisions with other POCs.
- `springdoc.*` — Swagger/OpenAPI endpoints.

## Build/Run
- `mvn spring-boot:run`
- `npm install && npm start`
