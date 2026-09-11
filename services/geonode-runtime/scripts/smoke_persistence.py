from __future__ import annotations

import json
from pathlib import Path

from app.persistence import persist_to_minio, persist_to_postgis


ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / "outputs" / "geonode-artifacts"
OUT.mkdir(parents=True, exist_ok=True)

artifact_path = OUT / "persistence-smoke.json"
artifact = {
    "id": "artifact-persistence-smoke",
    "type": "derived_report",
    "outputs": {"affected_population": 1, "crop_loss_estimate_usd": 1, "confidence": 0.99},
}
job = {
    "id": "job-persistence-smoke",
    "skill_id": "skill.flood-impact-analysis",
    "status": "succeeded",
    "progress": 100,
    "request": {"region": "smoke", "date_range": "now"},
}

artifact_path.write_text(json.dumps(artifact, indent=2), encoding="utf-8")
print("minio", persist_to_minio(artifact_path, artifact_path.name))
print("postgis", persist_to_postgis(job, artifact))
