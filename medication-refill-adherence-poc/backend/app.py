"""FastAPI application for medication refill and adherence workflows."""

from __future__ import annotations

from contextlib import asynccontextmanager
from typing import Any

from fastapi import Body, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from adapters import Infrastructure
from core import seeded_service


service = seeded_service()
infrastructure = Infrastructure().connect()


@asynccontextmanager
async def lifespan(_: FastAPI):
    yield
    infrastructure.close()


app = FastAPI(title="Medication Refill and Adherence POC", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:5182", "http://localhost:5182"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class DoseCommand(BaseModel):
    actor_id: str = "user-vedant"
    state: str
    idempotency_key: str = Field(min_length=1)
    note: str = ""


class InventoryCommand(BaseModel):
    actor_id: str = "user-vedant"
    delta: float
    reason: str = "MANUAL_CORRECTION"
    reference: str = Field(min_length=1)


class RefillCommand(BaseModel):
    actor_id: str = "user-vedant"
    quantity: int = Field(gt=0)
    idempotency_key: str = Field(min_length=1)


class RefillStatusCommand(BaseModel):
    actor_id: str = "user-vedant"
    status: str


class PrescriptionCommand(BaseModel):
    actor_id: str = "user-vedant"
    rx_number_masked: str
    authorized_refills: int = Field(ge=0)
    remaining_refills: int = Field(ge=0)
    expires_on: str


def state() -> dict[str, Any]:
    return {
        "households": service.households,
        "members": service.members,
        "medications": service.medications,
        "prescriptions": service.prescriptions,
        "doses": service.doses,
        "inventory_ledger": service.inventory_ledger,
        "refills": service.refills,
        "jobs": service.jobs,
        "deliveries": service.deliveries,
        "audit": service.audit,
    }


def execute(fn):
    try:
        result = fn()
        infrastructure.save(state())
        infrastructure.mirror_jobs(service.jobs)
        return result
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/api/health")
def health() -> dict[str, Any]:
    return {"status": "ok", "persistence": infrastructure.mode}


@app.get("/api/snapshot")
def snapshot(
    household_id: str = "household-maple",
    actor_id: str = "user-vedant",
    local_date: str = "2026-06-13",
) -> dict[str, Any]:
    return execute(lambda: service.snapshot(household_id, actor_id, local_date))


@app.get("/api/medications/{medication_id}")
def medication(medication_id: str, actor_id: str = "user-vedant") -> dict[str, Any]:
    return execute(lambda: service.medication_view(medication_id, actor_id))


@app.post("/api/doses/materialize")
def materialize(local_date: str = Body(default="2026-06-13", embed=True)) -> dict[str, Any]:
    return execute(lambda: service.materialize_doses(local_date))


@app.post("/api/doses/{dose_id}/resolve")
def resolve_dose(dose_id: str, request: DoseCommand) -> dict[str, Any]:
    return execute(lambda: service.mark_dose(dose_id, **request.model_dump()))


@app.post("/api/medications/{medication_id}/inventory")
def inventory(medication_id: str, request: InventoryCommand) -> dict[str, Any]:
    return execute(lambda: service.adjust_inventory(medication_id, **request.model_dump()))


@app.post("/api/medications/{medication_id}/refills")
def refill(medication_id: str, request: RefillCommand) -> dict[str, Any]:
    return execute(lambda: service.request_refill(medication_id, **request.model_dump()))


@app.post("/api/refills/{refill_id}/status")
def refill_status(refill_id: str, request: RefillStatusCommand) -> dict[str, Any]:
    return execute(lambda: service.update_refill(refill_id, **request.model_dump()))


@app.post("/api/medications/{medication_id}/prescriptions")
def prescription(medication_id: str, request: PrescriptionCommand) -> dict[str, Any]:
    return execute(lambda: service.add_prescription_version(medication_id, **request.model_dump()))


@app.post("/api/scheduler/run")
def scheduler(now: str = Body(default="2026-06-13T21:30:00Z", embed=True)) -> dict[str, Any]:
    return execute(lambda: service.run_scheduler(now))


@app.post("/api/workers/tick")
def worker_tick() -> dict[str, Any]:
    return execute(service.worker_tick)


@app.post("/api/workers/drain")
def worker_drain(max_jobs: int = Query(default=25, ge=1, le=100)) -> dict[str, Any]:
    return execute(lambda: service.drain_workers(max_jobs))


@app.post("/api/workers/fail-next")
def fail_next() -> dict[str, Any]:
    service.fail_next_delivery = True
    return {"armed": True}


@app.post("/api/reset")
def reset() -> dict[str, Any]:
    global service
    service = seeded_service()
    return execute(lambda: service.snapshot(local_date="2026-06-13"))
