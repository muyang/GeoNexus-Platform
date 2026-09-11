# GeoNexus Implementation Roadmap

This repository now starts Phase 1: a standalone GeoNode runtime.

## Current Slice

Implemented:
- FastAPI GeoNode runtime scaffold
- GeoNode manifest
- Flood Impact Analysis GeoSkill manifest
- First sample GeoJSON + gridded flood exposure statistics
- Async GeoJob execution with derived artifact output
- Optional MinIO artifact upload and PostGIS job metadata persistence
- Local STAC catalog endpoint for sample raster assets
- Rasterio-generated sample flood-depth GeoTIFF asset
- Derived flood-map GeoTIFF exposed as a tiled/overview COG-style asset
- COG validation endpoint and HTTP range-read support
- Shared flood workflow runner with local worker fallback
- Temporal SDK client/workflow/worker scaffolding with `WORKFLOW_ENGINE=local|temporal`
- Docker Compose Temporal profile for the core stack
- Docker Compose infrastructure for PostGIS, Redis, MinIO and GeoNode runtime

## Run GeoNode Runtime

```bash
python3 -m venv .venv-geonode
.venv-geonode/bin/pip install -r services/geonode-runtime/requirements.txt
.venv-geonode/bin/uvicorn app.main:app --app-dir services/geonode-runtime --reload --port 8100
```

Test:

```bash
curl http://localhost:8100/health
curl http://localhost:8100/node/manifest
curl http://localhost:8100/capabilities
curl -X POST http://localhost:8100/jobs \
  -H 'Content-Type: application/json' \
  -d '{"skill_id":"skill.flood-impact-analysis","region":"Mekong Delta","date_range":"last_14_days"}'
```

## Run Infrastructure

Core stack using locally available images:

```bash
docker compose -f infra/docker-compose.phase1-core.yml up --build -d
```

Full stack including MinIO:

```bash
docker compose -f infra/docker-compose.phase1.yml up --build
```

## Verified Infrastructure Smoke Test

The core stack was verified with:

- `pgvector/pgvector:pg16` PostgreSQL container
- `redis:7-alpine` container
- `geonode-runtime` container

Verified result:

```text
POST /jobs -> succeeded
artifact.persistence.postgis.enabled = true
geonode_jobs table contains the completed job metadata
```

MinIO remains part of the full stack, but requires the `minio/minio` image to be available from Docker Hub or a configured mirror.

## Next Slice

1. Replace sample GeoJSON grid with Rasterio windowed reads and raster/vector overlay.
2. Add GeoPandas vector layers for population/crop exposure instead of embedded properties.
3. Verify end-to-end Temporal execution once `temporalio/auto-setup` image is available locally or via mirror.
4. Connect Spring Boot control plane once introduced.
5. Add MinIO artifact validation when Docker Hub or mirror access is available.

## Persistence Smoke Test

With Docker Compose infrastructure running and these environment variables set:

```bash
export POSTGIS_DSN=postgresql://geonexus:geonexus@localhost:5433/geonexus
export MINIO_ENDPOINT=localhost:9000
export MINIO_ACCESS_KEY=geonexus
export MINIO_SECRET_KEY=geonexus123
export MINIO_BUCKET=geonexus-artifacts
```

Run:

```bash
PYTHONPATH=services/geonode-runtime .venv-geonode/bin/python services/geonode-runtime/scripts/smoke_persistence.py
```
