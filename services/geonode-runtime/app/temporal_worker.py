from __future__ import annotations

import argparse
import asyncio
from pathlib import Path
from typing import Any, Dict

from app.job_workflow import execute_flood_workflow, now
from app.settings import TEMPORAL_ADDRESS, TEMPORAL_NAMESPACE, TEMPORAL_TASK_QUEUE
from app.temporal_workflows import FloodImpactWorkflow, run_flood_analysis_activity
from temporalio.client import Client
from temporalio.worker import Worker


def run_once(job: Dict[str, Any], artifact_dir: Path) -> Dict[str, Any]:
    events = []

    def emit_event(progress: int, message: str) -> None:
        events.append({"ts": now(), "progress": progress, "message": message})

    artifact = execute_flood_workflow(job, artifact_dir, emit_event, sleep_seconds=0)
    return {"events": events, "artifact": artifact}


async def run_worker() -> None:
    client = await Client.connect(TEMPORAL_ADDRESS, namespace=TEMPORAL_NAMESPACE)
    worker = Worker(
        client,
        task_queue=TEMPORAL_TASK_QUEUE,
        workflows=[FloodImpactWorkflow],
        activities=[run_flood_analysis_activity],
    )
    await worker.run()


def main() -> None:
    parser = argparse.ArgumentParser(description="GeoNexus Temporal worker placeholder for GeoSkill workflows.")
    parser.add_argument("--artifact-dir", default="outputs/geonode-artifacts")
    parser.add_argument("--run", action="store_true", help="Connect to Temporal and run the worker.")
    args = parser.parse_args()
    if args.run:
        asyncio.run(run_worker())
        return

    print(
        "Temporal worker entrypoint is ready. "
        f"Address: {TEMPORAL_ADDRESS}; namespace: {TEMPORAL_NAMESPACE}; "
        f"task queue: {TEMPORAL_TASK_QUEUE}; artifact directory: {Path(args.artifact_dir).resolve()}"
    )


if __name__ == "__main__":
    main()
