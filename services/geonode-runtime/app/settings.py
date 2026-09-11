from __future__ import annotations

import os


WORKFLOW_ENGINE = os.getenv("WORKFLOW_ENGINE", "local").strip().lower()
TEMPORAL_ADDRESS = os.getenv("TEMPORAL_ADDRESS", "localhost:7233")
TEMPORAL_NAMESPACE = os.getenv("TEMPORAL_NAMESPACE", "default")
TEMPORAL_TASK_QUEUE = os.getenv("TEMPORAL_TASK_QUEUE", "geonexus-geoskill")


def workflow_engine() -> str:
    if WORKFLOW_ENGINE not in {"local", "temporal"}:
        return "local"
    return WORKFLOW_ENGINE
