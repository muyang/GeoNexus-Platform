from __future__ import annotations

from datetime import timedelta
from typing import Any, Dict

from temporalio import activity, workflow

with workflow.unsafe.imports_passed_through():
    from pathlib import Path

    from app.job_workflow import execute_flood_workflow, now


@activity.defn
def run_flood_analysis_activity(job: Dict[str, Any], artifact_dir: str) -> Dict[str, Any]:
    events = []

    def emit_event(progress: int, message: str) -> None:
        events.append({"ts": now(), "progress": progress, "message": message})

    artifact = execute_flood_workflow(job, Path(artifact_dir), emit_event)
    return {"events": events, "artifact": artifact}


@workflow.defn
class FloodImpactWorkflow:
    @workflow.run
    async def run(self, job: Dict[str, Any], artifact_dir: str) -> Dict[str, Any]:
        return await workflow.execute_activity(
            run_flood_analysis_activity,
            args=[job, artifact_dir],
            start_to_close_timeout=timedelta(minutes=10),
        )
