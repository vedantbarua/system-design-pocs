# Bar Menu POC Technical README

## Problem Statement

A bar menu is easy to model as static content, but real preparation needs workflow state. The system must turn a selected drink into a guided session, track the current recipe step, expose progress, and keep a small operational history for the bartender or demo viewer.

## Architecture Overview

The POC is a single Spring Boot application:

- `BarMenuController` serves the Thymeleaf UI and JSON API.
- `BarMenuService` owns the drink catalog, active prep sessions, and event log.
- `PrepSession` is the workflow state machine for one drink build.
- `Drink`, `Ingredient`, and `RecipeStep` define immutable catalog data.

All state is in memory. The controller never mutates session fields directly; it calls service methods so UI form posts and API calls share identical transition behavior.

## Core Data Model

- `Drink`: catalog entry with id, name, category, glass, flavor notes, alcoholic flag, ingredients, and ordered recipe steps.
- `RecipeStep`: numbered instruction with a title, instruction text, and focus time in seconds.
- `PrepSession`: active workflow with id, drink reference, current step index, status, start time, and update time.
- `PrepEvent`: append-only audit event for helper lifecycle and step movement.

## Request or Event Flow

1. A user starts a drink from the menu.
2. `POST /sessions` or `POST /api/sessions` calls `BarMenuService.start`.
3. The service validates the drink id, creates a session, stores it, and logs a start event.
4. Next, Back, and Reset requests call the matching service transition.
5. The service updates the session and appends an event.
6. The UI reloads after form posts and also polls JSON endpoints for live progress/event refresh.

## Key Tradeoffs

- In-memory state keeps the POC simple and fast to run, but sessions are lost on restart.
- Short UUID prefixes are readable in the UI, but production would use full durable IDs.
- Polling is simpler than WebSockets for a local demo, but it is less efficient for high fan-out live updates.
- Recipe data is seeded in Java code to avoid database setup, but production would store menu data externally.

## Failure Handling

- Unknown drink IDs are rejected with a clear UI message or HTTP 400.
- Unknown session IDs return a clear UI message or HTTP 404 for JSON transitions.
- Completed sessions ignore additional advance calls and remain complete.
- Back from a completed session reopens the last step so the operator can correct a mistake.

## Scaling Path

- Move drinks and sessions to a database.
- Add optimistic locking or version numbers to prevent conflicting bartender actions.
- Publish prep events to a stream for screens, analytics, or kitchen displays.
- Replace polling with WebSockets or Server-Sent Events.
- Add inventory reservations so starting a helper can decrement stock safely.

## What Is Intentionally Simplified

- No persistent storage
- No user accounts or role-based access
- No inventory depletion or replenishment
- No menu editing UI
- No multi-location routing
- No payment or order checkout
