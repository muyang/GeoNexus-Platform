from __future__ import annotations

import json
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Dict, Iterable, Tuple

from app.persistence import persist_to_minio, persist_to_postgis
from app.processing import DEFAULT_REGION, run_flood_statistics
from app.raster_assets import (
    ensure_derived_flood_cog,
    summarize_derived_flood_cog,
    summarize_flood_raster,
    validate_derived_flood_cog,
)


WorkflowEventSink = Callable[[int, str], None]

FLOOD_WORKFLOW_STEPS: Tuple[Tuple[int, str], ...] = (
    (18, "Validated region and date range"),
    (36, "Retrieved water extent source"),
    (58, "Ran flood segmentation workflow"),
    (76, "Computed exposure and crop-loss indicators"),
    (92, "Generated derived artifacts"),
)


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def iter_flood_workflow_steps() -> Iterable[Tuple[int, str]]:
    return FLOOD_WORKFLOW_STEPS


def build_flood_artifact(job: Dict[str, Any], artifact_dir: Path) -> Dict[str, Any]:
    job_id = job["id"]
    stats = run_flood_statistics(job["request"].get("region") or DEFAULT_REGION)
    artifact_path = artifact_dir / f"{job_id}.json"
    return {
        "id": f"artifact-{job_id}",
        "type": "derived_report",
        "title": "Mekong flood impact derived summary",
        "path": str(artifact_path),
        "outputs": {
            "flood_map": str(ensure_derived_flood_cog()),
            "affected_population": stats["affected_population"],
            "crop_loss_estimate_usd": stats["crop_loss_estimate_usd"],
            "confidence": stats["confidence"],
        },
        "statistics": stats,
        "raster_summary": summarize_flood_raster(),
        "cog_summary": summarize_derived_flood_cog(),
        "cog_validation": validate_derived_flood_cog(),
        "stac_item": "/stac/items/mekong-flood-depth-sample",
    }


def execute_flood_workflow(
    job: Dict[str, Any],
    artifact_dir: Path,
    emit_event: WorkflowEventSink,
    sleep_seconds: float = 0.6,
) -> Dict[str, Any]:
    for progress, message in iter_flood_workflow_steps():
        if sleep_seconds:
            time.sleep(sleep_seconds)
        emit_event(progress, message)

    artifact = build_flood_artifact(job, artifact_dir)
    artifact_path = Path(artifact["path"])
    artifact_path.write_text(json.dumps(artifact, indent=2), encoding="utf-8")
    artifact["persistence"] = {
        "minio": persist_to_minio(artifact_path, f"{job['id']}.json"),
        "postgis": persist_to_postgis(job, artifact),
    }
    artifact_path.write_text(json.dumps(artifact, indent=2), encoding="utf-8")
    return artifact
