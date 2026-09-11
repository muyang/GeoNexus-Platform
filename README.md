# GeoNexus

GeoNexus is a federated GeoAI capability network MVP.

It demonstrates:
- GeoMCP protocol routing
- GeoCapability Registry
- GeoSkill discovery and orchestration
- GeoAgent planning
- GeoKG graph relationships
- GeoNode federation and policy routing
- Product-style task routing and detail views
- SQLite-backed persistence for tasks, jobs, and events

## Run

```bash
npm start
```

Then open:

```text
http://localhost:3100
```

If that port is occupied, GeoNexus automatically tries the next free port.

If `3001` is taken, set a custom port:

```bash
PORT=3173 npm start
```

## API

- `GET /api/health`
- `GET /api/registry?query=&type=&region=`
- `GET /api/capabilities/:id`
- `GET /api/geocards`
- `GET /api/geocards/:id`
- `GET /api/data-products`
- `POST /api/data-products`
- `POST /api/geomcp/register`
- `POST /api/geomcp/discover`
- `GET /api/kg?focus=`
- `GET /api/nodes`
- `GET /api/tasks`
- `GET /api/tasks/:id`
- `POST /api/plan`
- `POST /api/jobs`
- `GET /api/jobs/:id`

## Persistence

GeoNexus uses a local SQLite database at `data/geonexus.db`.

On first run it seeds:
- registry capabilities
- geo nodes
- sample geospatial tasks

Jobs and events are persisted so the workflow survives server restarts.

## GeoMCP + GeoCard

Data products are registered as both:

- `data_products` rows with GeoCard metadata
- `GeoDataProductCapability` rows in the GeoCapability Registry

This lets GeoMCP discover data products and lets the UI render them as GeoCards.

Authenticated local asset registration is also available:

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/assets`
- `GET /api/assets`

End-to-end smoke flow:

```bash
TOKEN=$(curl -s -X POST http://localhost:3102/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"name":"Local Builder","email":"builder@local.test","password":"geonexus123","org":"Local Geo Lab"}' \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["token"])')

curl -s -X POST http://localhost:3102/api/assets \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"assetKind":"model","title":"Local Flood Classifier Model","provider":"Local Geo Lab","nodeId":"node.mekong","region":"Southeast Asia","accessUrl":"local://models/flood-classifier:1.0","license":"private","policyId":"policy.data-sovereignty-asean","inputs":["water_extent_raster","aoi"],"outputs":["flood_probability","derived_map"],"tags":["flood","model","local"],"description":"Local model asset registered as a GeoCard."}'
```

## Files

- `index.html` - frontend app
- `styles.css` - UI system and animation styles
- `app.js` - API-driven frontend orchestration
- `server.js` - Node API and static file server
- `data/registry.json` - GeoCapability Registry data layer
- `docs/product-architecture.md` - product model and roadmap
- `services/geonode-runtime/` - Phase 1 FastAPI GeoNode Runtime
- `manifests/` - GeoNode and GeoSkill manifests
- `infra/docker-compose.phase1.yml` - PostGIS, Redis, MinIO, GeoNode runtime stack

## Phase 1 GeoNode Runtime

Run the first standalone GeoNode:

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

The GeoNexus console includes a runtime page:

```text
http://localhost:3101/runtime
```

It calls the GeoNode Runtime at `http://localhost:8100` and submits a GeoJSON region to `skill.flood-impact-analysis`.

The first flood workflow now uses:

- `services/geonode-runtime/data/sample_flood_grid.geojson`
- Shapely polygon intersection
- Rasterio-generated sample flood-depth GeoTIFF
- Rasterio-generated derived flood-map GeoTIFF with tiled/overview COG-style layout
- Local STAC endpoints: `/stac` and `/stac/items/mekong-flood-depth-sample`
- depth-weighted population and crop exposure statistics
- local artifact fallback plus optional PostGIS/MinIO persistence
- shared workflow runner with local worker fallback, ready for Temporal binding

Workflow modules:

- `services/geonode-runtime/app/job_workflow.py` - reusable flood workflow logic
- `services/geonode-runtime/app/local_worker.py` - current local execution fallback
- `services/geonode-runtime/app/temporal_worker.py` - Temporal worker entrypoint placeholder

Workflow mode is controlled by environment variables:

- `WORKFLOW_ENGINE=local` uses the embedded local worker fallback
- `WORKFLOW_ENGINE=temporal` schedules jobs on Temporal
- `TEMPORAL_ADDRESS`, `TEMPORAL_NAMESPACE`, and `TEMPORAL_TASK_QUEUE` configure Temporal connectivity

Raster assets:

- Source flood depth: `/assets/rasters/mekong_flood_depth_sample.tif`
- Derived flood map: `/assets/cogs/mekong_flood_map_derived_cog.tif`
- COG validation: `/assets/cogs/mekong_flood_map_derived_cog.tif/validate`

Validate COG metadata and HTTP range reads:

```bash
curl http://localhost:8100/assets/cogs/mekong_flood_map_derived_cog.tif/validate
curl -H 'Range: bytes=0-99' http://localhost:8100/assets/cogs/mekong_flood_map_derived_cog.tif -o /tmp/mekong-range.bin -i
```

Optional persistence environment variables:

```bash
export POSTGIS_DSN=postgresql://geonexus:geonexus@localhost:5433/geonexus
export MINIO_ENDPOINT=localhost:9000
export MINIO_ACCESS_KEY=geonexus
export MINIO_SECRET_KEY=geonexus123
export MINIO_BUCKET=geonexus-artifacts
```

Run cloud-native infrastructure:

```bash
docker compose -f infra/docker-compose.phase1-core.yml up --build -d
```

Run full infrastructure with MinIO when Docker Hub access is available:

```bash
docker compose -f infra/docker-compose.phase1.yml up --build
```

Run core infrastructure with Temporal profile when `temporalio/auto-setup` is available:

```bash
docker compose -f infra/docker-compose.phase1-core.yml --profile temporal up --build -d
```
