"""FastAPI and WebSocket API for family safety check-ins."""

from __future__ import annotations

from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from adapters import Infrastructure
from core import seeded_service


DEMO_NOW = "2026-06-14T23:45:00Z"
service = seeded_service()
infrastructure = Infrastructure().connect()


class ConnectionManager:
    def __init__(self) -> None:
        self.connections: dict[str, list[WebSocket]] = {}

    async def connect(self, household_id: str, websocket: WebSocket) -> None:
        await websocket.accept()
        self.connections.setdefault(household_id, []).append(websocket)

    def disconnect(self, household_id: str, websocket: WebSocket) -> None:
        group = self.connections.get(household_id, [])
        if websocket in group:
            group.remove(websocket)

    async def broadcast(self, household_id: str, payload: dict[str, Any]) -> None:
        stale = []
        for connection in self.connections.get(household_id, []):
            try:
                await connection.send_json(payload)
            except Exception:
                stale.append(connection)
        for connection in stale:
            self.disconnect(household_id, connection)

    def count(self, household_id: str) -> int:
        return len(self.connections.get(household_id, []))


manager = ConnectionManager()


@asynccontextmanager
async def lifespan(_: FastAPI):
    yield
    infrastructure.close()


app = FastAPI(title="Family Safety Check-in POC", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:5183", "http://localhost:5183"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class CreateCheckin(BaseModel):
    household_id: str = "household-maple"
    actor_id: str = "user-vedant"
    member_id: str
    title: str
    destination: str
    opens_at: str
    due_at: str
    grace_minutes: int = Field(default=20, ge=5, le=120)
    note: str = ""


class AcknowledgeCheckin(BaseModel):
    actor_id: str = "user-vedant"
    idempotency_key: str = Field(min_length=1)
    message: str = "Safe"
    occurred_at: str | None = None


class CancelCheckin(BaseModel):
    actor_id: str = "user-vedant"
    reason: str = ""


class StartLocation(BaseModel):
    actor_id: str
    latitude: float
    longitude: float
    accuracy_meters: int = Field(ge=1)
    label: str
    ttl_minutes: int = Field(default=60, ge=5, le=120)
    captured_at: str


class LocationUpdate(BaseModel):
    actor_id: str
    sequence: int = Field(ge=1)
    latitude: float
    longitude: float
    accuracy_meters: int = Field(ge=1)
    label: str
    captured_at: str


class StopLocation(BaseModel):
    actor_id: str


class SchedulerRun(BaseModel):
    now: str = DEMO_NOW


class OfflineEvent(BaseModel):
    client_event_id: str = Field(min_length=1)
    kind: str
    occurred_at: str
    payload: dict[str, Any]


class OfflineSync(BaseModel):
    actor_id: str
    events: list[OfflineEvent]


def state() -> dict[str, Any]:
    return {
        "households": service.households,
        "members": service.members,
        "checkins": service.checkins,
        "locations": service.locations,
        "jobs": service.jobs,
        "deliveries": service.deliveries,
        "events": service.events,
    }


def execute(fn):
    try:
        result = fn()
        infrastructure.save(state())
        infrastructure.mirror_jobs(service.jobs)
        return result
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


async def announce(reason: str, household_id: str = "household-maple") -> None:
    payload = {"type": "snapshot.updated", "reason": reason, "household_id": household_id}
    infrastructure.publish(payload)
    await manager.broadcast(household_id, payload)


@app.get("/api/health")
def health() -> dict[str, Any]:
    return {"status": "ok", "persistence": infrastructure.mode, "websocket_clients": manager.count("household-maple")}


@app.get("/api/snapshot")
def snapshot(
    household_id: str = "household-maple",
    actor_id: str = "user-vedant",
    now: str = DEMO_NOW,
) -> dict[str, Any]:
    return execute(lambda: service.snapshot(household_id, actor_id, now))


@app.get("/api/checkins/{checkin_id}")
def checkin(checkin_id: str, now: str = DEMO_NOW) -> dict[str, Any]:
    return execute(lambda: service.checkin_view(checkin_id, now))


@app.post("/api/checkins")
async def create_checkin(request: CreateCheckin) -> dict[str, Any]:
    result = execute(lambda: service.create_checkin(**request.model_dump()))
    await announce("checkin.created", request.household_id)
    return result


@app.post("/api/checkins/{checkin_id}/acknowledge")
async def acknowledge(checkin_id: str, request: AcknowledgeCheckin) -> dict[str, Any]:
    result = execute(lambda: service.acknowledge(checkin_id, **request.model_dump()))
    await announce("checkin.acknowledged")
    return result


@app.post("/api/checkins/{checkin_id}/cancel")
async def cancel(checkin_id: str, request: CancelCheckin) -> dict[str, Any]:
    result = execute(lambda: service.cancel_checkin(checkin_id, **request.model_dump()))
    await announce("checkin.canceled")
    return result


@app.post("/api/checkins/{checkin_id}/location")
async def start_location(checkin_id: str, request: StartLocation) -> dict[str, Any]:
    result = execute(lambda: service.start_location_share(checkin_id, **request.model_dump()))
    await announce("location.started")
    return result


@app.put("/api/members/{member_id}/location")
async def update_location(member_id: str, request: LocationUpdate) -> dict[str, Any]:
    result = execute(lambda: service.update_location(member_id, **request.model_dump()))
    await announce("location.updated")
    return result


@app.post("/api/members/{member_id}/location/stop")
async def stop_location(member_id: str, request: StopLocation) -> dict[str, Any]:
    result = execute(lambda: service.stop_location_share(member_id, request.actor_id))
    await announce("location.stopped")
    return result


@app.post("/api/offline/sync")
async def offline_sync(request: OfflineSync) -> dict[str, Any]:
    result = execute(
        lambda: service.sync_events(
            request.actor_id, [event.model_dump() for event in request.events]
        )
    )
    await announce("offline.sync")
    return result


@app.post("/api/scheduler/run")
async def scheduler(request: SchedulerRun) -> dict[str, Any]:
    result = execute(lambda: service.run_scheduler(request.now))
    await announce("scheduler.completed")
    return result


@app.post("/api/workers/tick")
async def worker_tick() -> dict[str, Any]:
    result = execute(service.worker_tick)
    await announce("worker.tick")
    return result


@app.post("/api/workers/drain")
async def worker_drain(max_jobs: int = Query(default=30, ge=1, le=100)) -> dict[str, Any]:
    result = execute(lambda: service.drain_workers(max_jobs))
    await announce("workers.drained")
    return result


@app.post("/api/workers/fail-next")
def fail_next() -> dict[str, Any]:
    service.fail_next_delivery = True
    return {"armed": True}


@app.post("/api/reset")
async def reset() -> dict[str, Any]:
    global service
    service = seeded_service()
    result = execute(lambda: service.snapshot(now=DEMO_NOW))
    await announce("demo.reset")
    return result


@app.websocket("/ws/households/{household_id}")
async def household_socket(
    websocket: WebSocket,
    household_id: str,
    actor_id: str = Query(default="user-vedant"),
) -> None:
    try:
        service._member(household_id, actor_id)
    except ValueError:
        await websocket.close(code=1008)
        return
    await manager.connect(household_id, websocket)
    await websocket.send_json(
        {
            "type": "snapshot",
            "data": service.snapshot(household_id, actor_id, DEMO_NOW),
            "connected_clients": manager.count(household_id),
        }
    )
    await manager.broadcast(
        household_id,
        {
            "type": "presence.updated",
            "connected_clients": manager.count(household_id),
        },
    )
    try:
        while True:
            message = await websocket.receive_json()
            if message.get("type") == "ping":
                await websocket.send_json({"type": "pong"})
    except WebSocketDisconnect:
        manager.disconnect(household_id, websocket)
        await manager.broadcast(
            household_id,
            {
                "type": "presence.updated",
                "connected_clients": manager.count(household_id),
            },
        )
