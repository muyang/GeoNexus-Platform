from __future__ import annotations

from pathlib import Path
from typing import Any, Dict

import numpy as np
import rasterio
from rasterio.transform import from_origin


DATA_DIR = Path(__file__).resolve().parents[1] / "data"
RASTER_DIR = DATA_DIR / "rasters"
RASTER_DIR.mkdir(parents=True, exist_ok=True)
FLOOD_DEPTH_TIF = RASTER_DIR / "mekong_flood_depth_sample.tif"
FLOOD_MAP_COG = RASTER_DIR / "mekong_flood_map_derived_cog.tif"


def ensure_sample_flood_raster() -> Path:
    if FLOOD_DEPTH_TIF.exists():
        return FLOOD_DEPTH_TIF

    data = np.array(
        [
            [0.8, 0.8, 0.35, 0.35, 0.95, 0.95],
            [0.8, 0.8, 0.35, 0.35, 0.95, 0.95],
            [1.2, 1.2, 0.1, 0.1, 0.55, 0.55],
            [1.2, 1.2, 0.1, 0.1, 0.55, 0.55],
        ],
        dtype="float32",
    )
    transform = from_origin(0, 8, 2, 2)
    with rasterio.open(
        FLOOD_DEPTH_TIF,
        "w",
        driver="GTiff",
        height=data.shape[0],
        width=data.shape[1],
        count=1,
        dtype=data.dtype,
        crs="EPSG:4326",
        transform=transform,
        nodata=-9999,
    ) as dataset:
        dataset.write(data, 1)
    return FLOOD_DEPTH_TIF


def ensure_derived_flood_cog() -> Path:
    if FLOOD_MAP_COG.exists():
        return FLOOD_MAP_COG

    source_path = ensure_sample_flood_raster()
    with rasterio.open(source_path) as source:
        flood_depth = source.read(1)
        derived_map = np.where(flood_depth >= 0.3, flood_depth, 0).astype("float32")
        profile = source.profile.copy()
        profile.update(
            driver="GTiff",
            compress="deflate",
            tiled=True,
            blockxsize=256,
            blockysize=256,
            nodata=0,
        )
        with rasterio.open(FLOOD_MAP_COG, "w", **profile) as dataset:
            dataset.write(derived_map, 1)
            dataset.update_tags(
                GEONEXUS_OUTPUT="derived_flood_map",
                GEONEXUS_POLICY="derived-output-only",
            )
            dataset.build_overviews([2], rasterio.enums.Resampling.average)
            dataset.update_tags(ns="rio_overview", resampling="average")
    return FLOOD_MAP_COG


def summarize_flood_raster() -> Dict[str, Any]:
    path = ensure_sample_flood_raster()
    with rasterio.open(path) as dataset:
        values = dataset.read(1)
        valid = values[values != dataset.nodata]
        return {
            "path": str(path),
            "crs": str(dataset.crs),
            "bounds": list(dataset.bounds),
            "width": dataset.width,
            "height": dataset.height,
            "min_depth_m": float(valid.min()),
            "max_depth_m": float(valid.max()),
            "mean_depth_m": round(float(valid.mean()), 3),
        }


def summarize_derived_flood_cog() -> Dict[str, Any]:
    path = ensure_derived_flood_cog()
    with rasterio.open(path) as dataset:
        values = dataset.read(1)
        valid = values[values > 0]
        return {
            "path": str(path),
            "crs": str(dataset.crs),
            "bounds": list(dataset.bounds),
            "width": dataset.width,
            "height": dataset.height,
            "min_depth_m": float(valid.min()),
            "max_depth_m": float(valid.max()),
            "mean_depth_m": round(float(valid.mean()), 3),
            "overviews": dataset.overviews(1),
            "is_tiled": dataset.is_tiled,
        }


def validate_derived_flood_cog() -> Dict[str, Any]:
    path = ensure_derived_flood_cog()
    with rasterio.open(path) as dataset:
        overviews = dataset.overviews(1)
        compression = dataset.compression.value if dataset.compression else None
        checks = {
            "exists": path.exists(),
            "driver_gtiff": dataset.driver == "GTiff",
            "is_tiled": dataset.is_tiled,
            "has_overviews": bool(overviews),
            "has_compression": compression is not None,
            "has_crs": dataset.crs is not None,
            "has_bounds": all(value is not None for value in dataset.bounds),
            "derived_output_tag": dataset.tags().get("GEONEXUS_OUTPUT") == "derived_flood_map",
            "policy_tag": dataset.tags().get("GEONEXUS_POLICY") == "derived-output-only",
        }
        return {
            "path": str(path),
            "valid": all(checks.values()),
            "checks": checks,
            "driver": dataset.driver,
            "compression": compression,
            "overviews": overviews,
            "block_shapes": dataset.block_shapes,
            "crs": str(dataset.crs),
            "bounds": list(dataset.bounds),
            "width": dataset.width,
            "height": dataset.height,
        }


def stac_catalog(base_url: str = "http://localhost:8100") -> Dict[str, Any]:
    return {
        "type": "Catalog",
        "id": "geonode-mekong-catalog",
        "stac_version": "1.0.0",
        "description": "Local STAC catalog for Mekong GeoNode sample assets.",
        "links": [
            {"rel": "self", "href": f"{base_url}/stac"},
            {"rel": "item", "href": f"{base_url}/stac/items/mekong-flood-depth-sample"},
        ],
    }


def stac_item(base_url: str = "http://localhost:8100") -> Dict[str, Any]:
    summary = summarize_flood_raster()
    cog_summary = summarize_derived_flood_cog()
    return {
        "type": "Feature",
        "stac_version": "1.0.0",
        "id": "mekong-flood-depth-sample",
        "bbox": summary["bounds"],
        "geometry": {
            "type": "Polygon",
            "coordinates": [[
                [summary["bounds"][0], summary["bounds"][1]],
                [summary["bounds"][2], summary["bounds"][1]],
                [summary["bounds"][2], summary["bounds"][3]],
                [summary["bounds"][0], summary["bounds"][3]],
                [summary["bounds"][0], summary["bounds"][1]],
            ]],
        },
        "properties": {
            "datetime": "2026-05-12T00:00:00Z",
            "geonexus:asset_type": "flood_depth_raster",
            "geonexus:mean_depth_m": summary["mean_depth_m"],
            "geonexus:max_depth_m": summary["max_depth_m"],
            "geonexus:derived_cog_mean_depth_m": cog_summary["mean_depth_m"],
            "geonexus:derived_cog_overviews": cog_summary["overviews"],
        },
        "assets": {
            "flood_depth": {
                "href": f"{base_url}/assets/rasters/mekong_flood_depth_sample.tif",
                "type": "image/tiff; application=geotiff",
                "roles": ["data"],
                "title": "Mekong sample flood depth GeoTIFF",
            },
            "derived_flood_map": {
                "href": f"{base_url}/assets/cogs/mekong_flood_map_derived_cog.tif",
                "type": "image/tiff; application=geotiff; profile=cloud-optimized",
                "roles": ["derived", "data"],
                "title": "Mekong derived flood map COG",
            }
        },
        "links": [
            {"rel": "self", "href": f"{base_url}/stac/items/mekong-flood-depth-sample"},
            {"rel": "root", "href": f"{base_url}/stac"},
        ],
    }
