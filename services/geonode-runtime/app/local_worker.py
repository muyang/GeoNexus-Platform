from __future__ import annotations

from pathlib import Path
from typing import Any, Dict

from app.job_workflow import execute_flood_workflow, now


def run_local_flood_worker(job: Dict[str, Any], artifact_dir: Path) -> None:
    def emit_event(progress: int, message: str) -> None:
        job["status"] = "running"
        job["progress"] = progress
        job["events"].append({"ts": now(), "message": message})

    try:
        artifact = execute_flood_workflow(job, artifact_dir, emit_event)
        job["status"] = "succeeded"
        job["progress"] = 100
        job["artifacts"].append(artifact)
        job["events"].append({"ts": now(), "message": "GeoNode returned derived outputs only"})
    except Exception as error:
        job["status"] = "failed"
        job["events"].append({"ts": now(), "message": f"Workflow failed: {error}"})
