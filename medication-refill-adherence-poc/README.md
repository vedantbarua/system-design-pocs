# Medication Refill and Adherence POC

React and FastAPI proof-of-concept for timezone-safe medication schedules, dose confirmation, inventory forecasting, refill workflows, caregiver escalation, and retryable reminder delivery with PostgreSQL and Redis.

## Goal

Demonstrate the system behavior behind a practical household medication organizer. The POC focuses on deterministic schedule materialization, idempotent commands, immutable inventory adjustments, reminder delivery semantics, caregiver access, and visible operational state.

## What It Covers

- Daily medication schedules using IANA timezones
- Daylight-saving-aware UTC occurrence generation
- Idempotent dose materialization
- Taken, skipped, missed, and scheduled dose states
- Replay-safe dose confirmation
- Inventory ledger and supply-day forecasts
- Low-supply detection and refill requests
- Requested, ordered, ready, completed, and canceled refill states
- Immutable prescription version history
- Patient, caregiver, and viewer permissions
- Dose reminders and missed-dose escalation
- Retryable, deduplicated notification delivery
- PostgreSQL state snapshots and Redis job mirrors
- Responsive React operations workspace

## Quick Start

Install dependencies:

```bash
cd medication-refill-adherence-poc/backend
python3 -m pip install -r requirements.txt

cd ../frontend
npm install
```

Start PostgreSQL and Redis:

```bash
docker compose up -d
```

Run FastAPI with infrastructure:

```bash
cd backend
MEDICATION_DATABASE_URL=postgresql://medication:medication@127.0.0.1:5433/medication_poc \
MEDICATION_REDIS_URL=redis://127.0.0.1:6380/0 \
uvicorn app:app --host 127.0.0.1 --port 8182
```

Run without infrastructure:

```bash
cd backend
MEDICATION_DATABASE_URL=memory:// \
MEDICATION_REDIS_URL=memory:// \
uvicorn app:app --host 127.0.0.1 --port 8182
```

Start React:

```bash
cd frontend
npm run dev
```

Open `http://127.0.0.1:5182`.

## UI Flows

1. Review today's dose timeline and seven-day adherence.
2. Mark a scheduled or missed dose as taken or skipped.
3. Confirm that a taken dose creates one inventory ledger debit.
4. Inspect supply forecasts and request a refill.
5. Move a refill through ordered, ready, and received states.
6. Add a manual inventory adjustment.
7. Add a new immutable prescription version.
8. Run the scheduler to generate due reminder and low-supply jobs.
9. Simulate a notification provider failure and inspect retry recovery.
10. Review delivery records and append-only activity history.

## JSON Endpoints

- `GET /api/health`
- `GET /api/snapshot`
- `GET /api/medications/{medicationId}`
- `POST /api/doses/materialize`
- `POST /api/doses/{doseId}/resolve`
- `POST /api/medications/{medicationId}/inventory`
- `POST /api/medications/{medicationId}/refills`
- `POST /api/refills/{refillId}/status`
- `POST /api/medications/{medicationId}/prescriptions`
- `POST /api/scheduler/run`
- `POST /api/workers/tick`
- `POST /api/workers/drain`
- `POST /api/workers/fail-next`
- `POST /api/reset`

Example dose confirmation:

```json
{
  "actor_id": "user-vedant",
  "state": "TAKEN",
  "idempotency_key": "mobile-command-7d234",
  "note": ""
}
```

Example refill request:

```json
{
  "actor_id": "user-vedant",
  "quantity": 30,
  "idempotency_key": "refill-lisinopril-june"
}
```

## Configuration

- FastAPI defaults to port `8182`
- React defaults to port `5182`
- PostgreSQL Compose port is `5433`
- Redis Compose port is `6380`
- `MEDICATION_DATABASE_URL` defaults to `memory://`
- `MEDICATION_REDIS_URL` defaults to `memory://`
- The deterministic demo date is June 13, 2026
- Doses become missed after a 60-minute grace period
- Notification jobs allow three delivery attempts

## Testing

```bash
cd backend
python3 -m unittest discover -s tests

cd ../frontend
npm run build
```

## Notes and Limitations

- The product is a workflow simulation, not medical guidance.
- The POC does not diagnose, recommend dosage changes, or replace clinician or pharmacist instructions.
- Authentication is represented by explicit demo actor IDs.
- Notification providers are deterministic simulations.
- Infrastructure mode persists a compact JSONB snapshot and mirrors pending jobs to Redis.
- The application is not a HIPAA compliance implementation.
- Recurrence is intentionally limited to daily schedule times.

## Technologies Used

- Python 3
- FastAPI
- Pydantic
- PostgreSQL
- Redis
- React 19
- Vite
- Lucide React
- `zoneinfo`
- `unittest`
