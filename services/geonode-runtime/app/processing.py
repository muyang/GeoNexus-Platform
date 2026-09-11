from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List

from shapely.geometry import shape


DATA_DIR = Path(__file__).resolve().parents[1] / "data"
FLOOD_GRID_PATH = DATA_DIR / "sample_flood_grid.geojson"

DEFAULT_REGION = {
    "type": "Feature",
    "properties": {"name": "Mekong Delta sample AOI"},
    "geometry": {
        "type": "Polygon",
        "coordinates": [[[1, 1], [10, 1], [10, 7], [1, 7], [1, 1]]],
    },
}


def load_flood_grid() -> List[Dict[str, Any]]:
    with FLOOD_GRID_PATH.open("r", encoding="utf-8") as file:
        collection = json.load(file)
    return collection["features"]


def region_geometry(region: Any):
    if isinstance(region, str) or not region:
        return shape(DEFAULT_REGION["geometry"])
    geometry = region.get("geometry", region)
    return shape(geometry)


def run_flood_statistics(region: Any) -> Dict[str, Any]:
    aoi = region_geometry(region)
    affected_population = 0.0
    crop_loss = 0.0
    flooded_area = 0.0
    max_depth = 0.0
    intersecting_cells = []

    for feature in load_flood_grid():
        props = feature["properties"]
        cell_geom = shape(feature["geometry"])
        overlap_geom = aoi.intersection(cell_geom)
        if overlap_geom.is_empty:
            continue

        ratio = overlap_geom.area / max(cell_geom.area, 1e-9)
        depth = float(props["flood_depth_m"])
        impact_factor = min(1.0, depth / 1.0)
        population = float(props["population"]) * ratio * impact_factor
        loss = float(props["crop_value_usd"]) * ratio * impact_factor * 0.42

        flooded_area += overlap_geom.area * impact_factor
        affected_population += population
        crop_loss += loss
        max_depth = max(max_depth, depth)
        intersecting_cells.append({
            "id": props["id"],
            "overlap_ratio": round(ratio, 3),
            "overlap_area": round(overlap_geom.area, 3),
            "flood_depth_m": depth,
            "affected_population": round(population),
            "crop_loss_estimate_usd": round(loss),
        })

    confidence = 0.78 + min(0.16, len(intersecting_cells) * 0.02)
    return {
        "aoi_area": round(aoi.area, 3),
        "aoi_bounds": [round(value, 3) for value in aoi.bounds],
        "intersecting_cells": intersecting_cells,
        "flooded_area_index": round(flooded_area, 2),
        "max_flood_depth_m": round(max_depth, 2),
        "affected_population": round(affected_population),
        "crop_loss_estimate_usd": round(crop_loss),
        "confidence": round(confidence, 2),
        "method": "Shapely polygon intersection with depth-weighted exposure statistics",
        "source": str(FLOOD_GRID_PATH),
    }
