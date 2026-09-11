from __future__ import annotations

from pathlib import Path
from typing import Any, Dict

from temporalio.client import Client

from app.settings import TEMPORAL_ADDRESS, TEMPORAL_NAMESPACE, TEMPORAL_TASK_QUEUE
from app.temporal_workflows import FloodImpactWorkflow


async def start_temporal_flood_workflow(job: Dict[str, Any], artifact_dir: Path) -> str:
    client = await Client.connect(TEMPORAL_ADDRESS, namespace=TEMPORAL_NAMESPACE)
    workflow_id = f"geonexus-{job['id']}"
    await client.start_workflow(
        FloodImpactWorkflow.run,
        args=[job, str(artifact_dir)],
        id=workflow_id,
        task_queue=TEMPORAL_TASK_QUEUE,
    )
    return workflow_id
