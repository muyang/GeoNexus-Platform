from __future__ import annotations

import uuid
import asyncio
from pathlib import Path
from threading import Thread
from typing import Any, Dict, List, Literal, Union

import yaml
from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from app.job_workflow import now
from app.local_worker import run_local_flood_worker
from app.raster_assets import (
    FLOOD_DEPTH_TIF,
    FLOOD_MAP_COG,
    ensure_derived_flood_cog,
    ensure_sample_flood_raster,
    stac_catalog,
    stac_item,
    validate_derived_flood_cog,
)
from app.settings import TEMPORAL_ADDRESS, TEMPORAL_NAMESPACE, TEMPORAL_TASK_QUEUE, workflow_engine


ROOT = Path(__file__).resolve().parents[3]
MANIFEST_DIR = ROOT / "manifests"
ARTIFACT_DIR = ROOT / "outputs" / "geonode-artifacts"
ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(
    title="GeoNexus GeoNode Runtime",
    version="0.1.0",
    description="Standalone sovereign GeoNode runtime for GeoSkill execution.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

jobs: Dict[str, Dict[str, Any]] = {}


class GeoJobRequest(BaseModel):
    skill_id: str = Field(default="skill.flood-impact-analysis")
    region: Union[Dict[str, Any], str] = Field(default="Mekong Delta")
    date_range: str = Field(default="last_14_days")
    requester: str = Field(default="GeoNexus Console")
    parameters: Dict[str, Any] = Field(default_factory=dict)


class GeoJobResponse(BaseModel):
    id: str
    status: Literal["queued", "running", "succeeded", "failed"]
    progress: int
    skill_id: str
    message: str
    artifacts: List[Dict[str, Any]] = Field(default_factory=list)


def ranged_file_response(path: Path, request: Request, media_type: str) -> Response:
    file_size = path.stat().st_size
    range_header = request.headers.get("range")
    if not range_header:
        return FileResponse(path, media_type=media_type, filename=path.name, headers={"Accept-Ranges": "bytes"})

    unit, _, byte_range = range_header.partition("=")
    if unit != "bytes" or "-" not in byte_range:
        raise HTTPException(status_code=416, detail="Unsupported range request")

    start_raw, end_raw = byte_range.split("-", 1)
    start = int(start_raw) if start_raw else 0
    end = int(end_raw) if end_raw else file_size - 1
    end = min(end, file_size - 1)
    if start > end or start >= file_size:
        raise HTTPException(status_code=416, detail="Requested range not satisfiable")

    def iter_file():
        with path.open("rb") as file:
            file.seek(start)
            remaining = end - start + 1
            while remaining > 0:
                chunk = file.read(min(64 * 1024, remaining))
                if not chunk:
                    break
                remaining -= len(chunk)
                yield chunk

    return StreamingResponse(
        iter_file(),
        status_code=206,
        media_type=media_type,
        headers={
            "Accept-Ranges": "bytes",
            "Content-Range": f"bytes {start}-{end}/{file_size}",
            "Content-Length": str(end - start + 1),
        },
    )


def read_yaml(path: Path) -> Dict[str, Any]:
    with path.open("r", encoding="utf-8") as file:
        return yaml.safe_load(file)


def load_node_manifest() -> Dict[str, Any]:
    return read_yaml(MANIFEST_DIR / "geonode-mekong.yaml")


def load_skill_manifest(skill_id: str) -> Dict[str, Any]:
    path = MANIFEST_DIR / "skills" / f"{skill_id.replace('.', '-')}.yaml"
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Unknown skill: {skill_id}")
    return read_yaml(path)


@app.get("/health")
def health() -> Dict[str, Any]:
    return {
        "ok": True,
        "service": "geonode-runtime",
        "node": "geonode-mekong",
        "workflow_engine": workflow_engine(),
        "temporal": {
            "address": TEMPORAL_ADDRESS,
            "namespace": TEMPORAL_NAMESPACE,
            "task_queue": TEMPORAL_TASK_QUEUE,
        },
    }


@app.get("/persistence/health")
def persistence_health() -> Dict[str, Any]:
    import os

    return {
        "postgis_configured": bool(os.getenv("POSTGIS_DSN")),
        "minio_configured": bool(os.getenv("MINIO_ENDPOINT")),
        "artifact_dir": str(ARTIFACT_DIR),
    }


@app.get("/node/manifest")
def node_manifest() -> Dict[str, Any]:
    return load_node_manifest()


@app.get("/capabilities")
def capabilities() -> Dict[str, Any]:
    node = load_node_manifest()
    skills = []
    for skill in node.get("capabilities", []):
        if skill.startswith("skill."):
            skills.append(load_skill_manifest(skill))
    return {"node": node["id"], "capabilities": node.get("capabilities", []), "skills": skills}


@app.get("/stac")
def get_stac_catalog(request: Request) -> Dict[str, Any]:
    ensure_sample_flood_raster()
    return stac_catalog(str(request.base_url).rstrip("/"))


@app.get("/stac/items/mekong-flood-depth-sample")
def get_stac_item(request: Request) -> Dict[str, Any]:
    ensure_sample_flood_raster()
    return stac_item(str(request.base_url).rstrip("/"))


@app.get("/assets/rasters/mekong_flood_depth_sample.tif")
def get_sample_raster() -> FileResponse:
    ensure_sample_flood_raster()
    return FileResponse(FLOOD_DEPTH_TIF, media_type="image/tiff", filename=FLOOD_DEPTH_TIF.name)


@app.get("/assets/cogs/mekong_flood_map_derived_cog.tif")
def get_derived_flood_cog(request: Request) -> Response:
    ensure_derived_flood_cog()
    return ranged_file_response(FLOOD_MAP_COG, request, "image/tiff")


@app.get("/assets/cogs/mekong_flood_map_derived_cog.tif/validate")
def validate_flood_cog() -> Dict[str, Any]:
    return validate_derived_flood_cog()


@app.post("/jobs", response_model=GeoJobResponse)
def create_job(request: GeoJobRequest) -> GeoJobResponse:
    manifest = load_skill_manifest(request.skill_id)
    job_id = f"job-{uuid.uuid4().hex[:12]}"
    jobs[job_id] = {
        "id": job_id,
        "status": "queued",
        "progress": 0,
        "skill_id": request.skill_id,
        "request": request.model_dump(),
        "skill_manifest": manifest,
        "message": "Job accepted by sovereign GeoNode runtime",
        "workflow_engine": workflow_engine(),
        "events": [{"ts": now(), "message": "Job accepted"}],
        "artifacts": [],
        "created_at": now(),
    }
    if workflow_engine() == "temporal":
        try:
            from app.temporal_client import start_temporal_flood_workflow

            workflow_id = asyncio.run(start_temporal_flood_workflow(jobs[job_id], ARTIFACT_DIR))
            jobs[job_id]["temporal_workflow_id"] = workflow_id
            jobs[job_id]["events"].append({"ts": now(), "message": f"Temporal workflow started: {workflow_id}"})
        except Exception as error:
            jobs[job_id]["status"] = "failed"
            jobs[job_id]["events"].append({"ts": now(), "message": f"Temporal scheduling failed: {error}"})
            raise HTTPException(status_code=503, detail=f"Temporal scheduling failed: {error}") from error
    else:
        Thread(target=run_local_flood_worker, args=(jobs[job_id], ARTIFACT_DIR), daemon=True).start()
    return GeoJobResponse(**jobs[job_id])


@app.get("/jobs/{job_id}")
def get_job(job_id: str) -> Dict[str, Any]:
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    return jobs[job_id]


@app.get("/jobs/{job_id}/artifacts")
def get_artifacts(job_id: str) -> Dict[str, Any]:
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    return {"job_id": job_id, "artifacts": jobs[job_id]["artifacts"]}
