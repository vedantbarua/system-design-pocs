"""FastAPI application for the personal document renewal vault."""

from __future__ import annotations

from contextlib import asynccontextmanager
from typing import Any

from fastapi import Body, FastAPI, HTTPException, Query, Response
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


app = FastAPI(title="Personal Document Renewal Vault POC", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:5181", "http://localhost:5181"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class UploadRequest(BaseModel):
    actor_id: str = "user-vedant"
    household_id: str = "household-maple"
    title: str
    category: str = "Other"
    filename: str
    content_type: str = "application/pdf"
    expires_on: str | None = None
    issuer: str = ""
    document_number_masked: str = ""
    document_id: str | None = None


class UploadBody(BaseModel):
    content: str = Field(min_length=1)
    simulate_malware: bool = False


class DownloadRequest(BaseModel):
    actor_id: str = "user-vedant"


class RenewRequest(BaseModel):
    actor_id: str = "user-vedant"
    title: str = ""
    expires_on: str
    filename: str = "renewed-document.pdf"


class ShareRequest(BaseModel):
    actor_id: str = "user-vedant"
    user_id: str
    role: str


def execute(fn):
    try:
        result = fn()
        infrastructure.save(
            {
                "households": service.households,
                "members": service.members,
                "documents": service.documents,
                "versions": service.versions,
                "jobs": service.jobs,
                "reminders": service.reminders,
                "audit": service.audit,
            }
        )
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
    as_of: str = "2026-06-12",
) -> dict[str, Any]:
    return execute(lambda: service.snapshot(household_id, actor_id, as_of))


@app.get("/api/documents/{document_id}")
def document(
    document_id: str,
    actor_id: str = "user-vedant",
    as_of: str = "2026-06-12",
) -> dict[str, Any]:
    return execute(lambda: service.document_view(document_id, actor_id, as_of))


@app.post("/api/uploads/request")
def request_upload(request: UploadRequest) -> dict[str, Any]:
    return execute(lambda: service.request_upload(**request.model_dump()))


@app.put("/api/uploads/{token}")
def upload(token: str, request: UploadBody) -> dict[str, Any]:
    content = request.content.encode("utf-8")
    result = execute(lambda: service.complete_upload(token, content, request.simulate_malware))
    grant = next(item for item in service.grants if item["token"] == token)
    infrastructure.put_object(grant["object_key"], content, grant["metadata"]["content_type"])
    return result


@app.post("/api/workers/tick")
def worker_tick() -> dict[str, Any]:
    return execute(service.worker_tick)


@app.post("/api/workers/drain")
def worker_drain(max_jobs: int = Query(default=20, ge=1, le=100)) -> dict[str, Any]:
    return execute(lambda: service.drain_workers(max_jobs))


@app.post("/api/documents/{document_id}/downloads")
def request_download(document_id: str, request: DownloadRequest) -> dict[str, Any]:
    return execute(lambda: service.request_download(document_id, request.actor_id))


@app.get("/api/downloads/{token}")
def download(token: str) -> Response:
    result = execute(lambda: service.download(token))
    stored = infrastructure.get_object(result["object_key"])
    return Response(
        content=stored if stored is not None else result["content"],
        media_type=result["content_type"],
        headers={"Content-Disposition": f'attachment; filename="{result["filename"]}"'},
    )


@app.post("/api/documents/{document_id}/renew")
def renew(document_id: str, request: RenewRequest) -> dict[str, Any]:
    return execute(lambda: service.renew_document(document_id, **request.model_dump()))


@app.post("/api/documents/{document_id}/share")
def share(document_id: str, request: ShareRequest) -> dict[str, Any]:
    return execute(lambda: service.share_document(document_id, **request.model_dump()))


@app.post("/api/reminders/run")
def reminders(as_of: str = Body(default="2026-06-12", embed=True)) -> dict[str, Any]:
    return execute(lambda: {"created": service.refresh_reminders(as_of)})


@app.post("/api/reset")
def reset() -> dict[str, Any]:
    global service
    service = seeded_service()
    return execute(lambda: service.snapshot(as_of="2026-06-12"))
