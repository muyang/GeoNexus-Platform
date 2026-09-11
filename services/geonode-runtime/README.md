# GeoNode Runtime

Phase 1 standalone GeoNode runtime for GeoNexus.

This service exposes a sovereign GeoNode API:

- `GET /health`
- `GET /node/manifest`
- `GET /capabilities`
- `POST /jobs`
- `GET /jobs/{job_id}`
- `GET /jobs/{job_id}/artifacts`

The current implementation simulates the first real GeoSkill, `skill.flood-impact-analysis`, and writes job outputs to local JSON artifacts. It is intentionally small so the execution contract can be stabilized before integrating Rasterio, PostGIS, MinIO, and Temporal workers.

## Run locally

```bash
python3 -m venv .venv-geonode
.venv-geonode/bin/pip install -r services/geonode-runtime/requirements.txt
.venv-geonode/bin/uvicorn app.main:app --app-dir services/geonode-runtime --reload --port 8100
```

Then open:

```text
http://localhost:8100/docs
```
