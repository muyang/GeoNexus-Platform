"""GeoNexus Execution Plane — 扩展内建技能 handlers。

P0 新增 8 个技能的真实实现（rasterio/numpy/shapely）：
- ndwi-analysis   : 归一化水体指数
- evi-analysis    : 增强植被指数
- ndbi-analysis   : 归一化建筑指数
- buffer-analysis : 空间缓冲区
- zonal-stats     : 分区统计
- reproject       : 坐标系统转换
- clip-crop       : 栅格裁剪
- composite-bands : 波段合成
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

import numpy as np
import rasterio
from geonexus.geonode.skill import SkillContext
from rasterio.mask import mask as rasterio_mask
from rasterio.warp import calculate_default_transform
from rasterio.warp import reproject as rasterio_reproject

from .handlers import _compute_stats, _resolve_output_path

logger = logging.getLogger("geonexus.execution_plane.extended_handlers")


# ═══════════════════════════════════════════════════════════════════
# 1. NDWI — Normalized Difference Water Index
# ═══════════════════════════════════════════════════════════════════

def ndwi_handler(params: dict[str, Any], context: SkillContext) -> dict[str, Any]:
    """NDWI = (Green - NIR) / (Green + NIR)，水体提取。"""
    green_path = Path(params["green"])
    nir_path = Path(params["nir"])
    _check_exists(green_path, "GREEN")
    _check_exists(nir_path, "NIR")

    output_path = _resolve_output_path(params, context, "ndwi.tif")

    with rasterio.open(green_path) as g, rasterio.open(nir_path) as n:
        green = g.read(1).astype(np.float32)
        nir = n.read(1).astype(np.float32)
        profile = g.profile.copy()
    _check_shape(green.shape, nir.shape, "GREEN", "NIR")

    with np.errstate(divide="ignore", invalid="ignore"):
        ndwi = (green - nir) / (green + nir)
    ndwi = np.clip(ndwi, -1.0, 1.0)
    stats = _compute_stats(ndwi)

    _write_float_tif(output_path, ndwi, profile)
    return {"ndwi_raster": str(output_path), "stats": stats}


# ═══════════════════════════════════════════════════════════════════
# 2. EVI — Enhanced Vegetation Index
# ═══════════════════════════════════════════════════════════════════

def evi_handler(params: dict[str, Any], context: SkillContext) -> dict[str, Any]:
    """EVI = 2.5*(NIR-RED) / (NIR + 6*RED - 7.5*BLUE + 1)，减少大气和土壤背景影响。"""
    red_path = Path(params["red"])
    nir_path = Path(params["nir"])
    blue_path = Path(params["blue"])
    for p, name in [(red_path, "RED"), (nir_path, "NIR"), (blue_path, "BLUE")]:
        if not p.exists():
            raise FileNotFoundError(f"{name} band not found: {p}")

    output_path = _resolve_output_path(params, context, "evi.tif")

    with rasterio.open(red_path) as r, rasterio.open(nir_path) as n, rasterio.open(blue_path) as b:
        red = r.read(1).astype(np.float32)
        nir = n.read(1).astype(np.float32)
        blue = b.read(1).astype(np.float32)
        profile = r.profile.copy()

    for arr, name in [(red, "RED"), (nir, "NIR"), (blue, "BLUE")]:
        _check_shape(red.shape, arr.shape, "RED", name)

    with np.errstate(divide="ignore", invalid="ignore"):
        evi = 2.5 * (nir - red) / (nir + 6.0 * red - 7.5 * blue + 1.0)
    evi = np.clip(evi, -1.0, 1.0)
    stats = _compute_stats(evi)

    _write_float_tif(output_path, evi, profile)
    return {"evi_raster": str(output_path), "stats": stats}


# ═══════════════════════════════════════════════════════════════════
# 3. NDBI — Normalized Difference Built-up Index
# ═══════════════════════════════════════════════════════════════════

def ndbi_handler(params: dict[str, Any], context: SkillContext) -> dict[str, Any]:
    """NDBI = (SWIR - NIR) / (SWIR + NIR)，建筑用地提取。"""
    swir_path = Path(params["swir"])
    nir_path = Path(params["nir"])
    _check_exists(swir_path, "SWIR")
    _check_exists(nir_path, "NIR")

    output_path = _resolve_output_path(params, context, "ndbi.tif")

    with rasterio.open(swir_path) as s, rasterio.open(nir_path) as n:
        swir = s.read(1).astype(np.float32)
        nir = n.read(1).astype(np.float32)
        profile = s.profile.copy()
    _check_shape(swir.shape, nir.shape, "SWIR", "NIR")

    with np.errstate(divide="ignore", invalid="ignore"):
        ndbi = (swir - nir) / (swir + nir)
    ndbi = np.clip(ndbi, -1.0, 1.0)
    stats = _compute_stats(ndbi)

    _write_float_tif(output_path, ndbi, profile)
    return {"ndbi_raster": str(output_path), "stats": stats}


# ═══════════════════════════════════════════════════════════════════
# 4. Buffer — 空间缓冲区
# ═══════════════════════════════════════════════════════════════════

def buffer_handler(params: dict[str, Any], context: SkillContext) -> dict[str, Any]:
    """对 GeoJSON 几何体生成缓冲区（Shapely）。"""
    from shapely.geometry import shape

    geometry_geojson = params["geometry"]
    distance = float(params.get("distance", 1000))

    geom = shape(geometry_geojson)
    buffered = geom.buffer(distance)
    result_geojson = json.dumps(
        {"type": "Feature", "geometry": buffered.__geo_interface__, "properties": {}}
    )

    output_path = _resolve_output_path(params, context, "buffer.geojson")
    output_path.write_text(result_geojson, encoding="utf-8")
    return {"buffered_geometry": result_geojson, "path": str(output_path)}


# ═══════════════════════════════════════════════════════════════════
# 5. Zonal Statistics — 分区统计
# ═══════════════════════════════════════════════════════════════════

def zonal_stats_handler(params: dict[str, Any], context: SkillContext) -> dict[str, Any]:
    """对栅格的每个分区 (zones) 进行统计（mean/sum/min/max/count）。"""
    from rasterio.features import geometry_mask
    from shapely.geometry import shape

    raster_path = Path(params["raster"])
    zones_geojson = params["zones"]
    _check_exists(raster_path, "raster")

    # Parse zones (FeatureCollection or list of features)
    if isinstance(zones_geojson, str):
        zones_data = json.loads(zones_geojson)
    else:
        zones_data = zones_geojson

    features = zones_data.get("features", [zones_data] if zones_data.get("type") == "Feature" else [])
    if not features:
        raise ValueError("No features found in zones GeoJSON")

    with rasterio.open(raster_path) as src:
        raster = src.read(1).astype(np.float32)
        transform = src.transform

    results = []
    for i, feat in enumerate(features):
        geom = shape(feat["geometry"])
        # Create mask for this geometry
        mask = geometry_mask(
            [geom], out_shape=raster.shape, transform=transform, invert=True
        )
        # Get raster values within this geometry
        values = raster[mask]
        valid = values[~np.isnan(values)]
        zone_name = feat.get("properties", {}).get("name", f"zone_{i}")
        results.append({
            "zone": zone_name,
            "mean": float(valid.mean()) if valid.size > 0 else None,
            "sum": float(valid.sum()) if valid.size > 0 else 0.0,
            "min": float(valid.min()) if valid.size > 0 else None,
            "max": float(valid.max()) if valid.size > 0 else None,
            "pixels": int(valid.size),
        })

    return {"zones": results, "zone_count": len(results)}


# ═══════════════════════════════════════════════════════════════════
# 6. Reproject — 坐标系统转换
# ═══════════════════════════════════════════════════════════════════

def reproject_handler(params: dict[str, Any], context: SkillContext) -> dict[str, Any]:
    """将栅格重新投影到目标 CRS。"""
    raster_path = Path(params["raster"])
    target_crs = params["target_crs"]
    _check_exists(raster_path, "raster")

    output_path = _resolve_output_path(params, context, "reprojected.tif")

    with rasterio.open(raster_path) as src:
        transform, width, height = calculate_default_transform(
            src.crs, target_crs, src.width, src.height, *src.bounds
        )
        profile = src.profile.copy()
        profile.update(crs=target_crs, transform=transform, width=width, height=height)

        with rasterio.open(output_path, "w", **profile) as dst:
            for i in range(1, src.count + 1):
                rasterio_reproject(
                    source=rasterio.band(src, i),
                    destination=rasterio.band(dst, i),
                    src_transform=src.transform,
                    src_crs=src.crs,
                    dst_transform=transform,
                    dst_crs=target_crs,
                    resampling=rasterio.enums.Resampling.bilinear,
                )

    with rasterio.open(output_path) as dst:
        bbox = list(dst.bounds)
        new_crs = str(dst.crs)

    return {
        "reprojected_raster": str(output_path),
        "target_crs": new_crs,
        "bbox": [float(v) for v in bbox],
        "width": width,
        "height": height,
    }


# ═══════════════════════════════════════════════════════════════════
# 7. Clip/Crop — 栅格裁剪
# ═══════════════════════════════════════════════════════════════════

def clip_handler(params: dict[str, Any], context: SkillContext) -> dict[str, Any]:
    """按几何体/边界框裁剪栅格。"""
    from shapely.geometry import box, shape

    raster_path = Path(params["raster"])
    _check_exists(raster_path, "raster")

    # Accept bbox [w,s,e,n] or geometry GeoJSON
    if "bbox" in params:
        bbox = params["bbox"]
        clip_geom = box(bbox[0], bbox[1], bbox[2], bbox[3])
    elif "geometry" in params:
        clip_geom = shape(params["geometry"])
    else:
        raise ValueError("Either 'bbox' or 'geometry' is required for clipping")

    output_path = _resolve_output_path(params, context, "clipped.tif")

    with rasterio.open(raster_path) as src:
        out_image, out_transform = rasterio_mask(
            src, [clip_geom], crop=True, nodata=src.nodata or 0
        )
        profile = src.profile.copy()
        profile.update(
            height=out_image.shape[1],
            width=out_image.shape[2],
            transform=out_transform,
            driver="GTiff",
        )

    with rasterio.open(output_path, "w", **profile) as dst:
        dst.write(out_image)

    stats = _compute_stats(out_image[0].astype(np.float32))
    return {"clipped_raster": str(output_path), "stats": stats}


# ═══════════════════════════════════════════════════════════════════
# 8. Composite Bands — 波段合成
# ═══════════════════════════════════════════════════════════════════

def composite_handler(params: dict[str, Any], context: SkillContext) -> dict[str, Any]:
    """将多个单波段 GeoTIFF 合成为一个多波段文件。"""
    band_paths = [Path(p) for p in params["bands"]]
    if len(band_paths) < 2:
        raise ValueError("At least 2 bands required for composite")

    for p in band_paths:
        _check_exists(p, f"band {p}")

    output_path = _resolve_output_path(params, context, "composite.tif")

    # Read all bands
    bands_data = []
    profile = None
    for p in band_paths:
        with rasterio.open(p) as src:
            bands_data.append(src.read(1).astype(np.float32))
            if profile is None:
                profile = src.profile.copy()

    # Check same shape
    shape0 = bands_data[0].shape
    for i, b in enumerate(bands_data):
        if b.shape != shape0:
            raise ValueError(f"Band {i} shape {b.shape} != {shape0}")

    profile.update(count=len(bands_data), driver="GTiff")
    with rasterio.open(output_path, "w", **profile) as dst:
        for i, band in enumerate(bands_data):
            dst.write(band, i + 1)

    return {
        "composite_raster": str(output_path),
        "bands": len(bands_data),
        "band_names": [p.stem for p in band_paths],
    }


# ═══════════════════════════════════════════════════════════════════
# Helpers
# ═══════════════════════════════════════════════════════════════════

def _check_exists(path: Path, name: str) -> None:
    if not path.exists():
        raise FileNotFoundError(f"{name} not found: {path}")


def _check_shape(a: tuple, b: tuple, name_a: str, name_b: str) -> None:
    if a != b:
        raise ValueError(f"{name_a} shape {a} != {name_b} shape {b}")


def _write_float_tif(path: Path, data: np.ndarray, profile: dict) -> None:
    profile.update(driver="GTiff", dtype=rasterio.float32, count=1, compress="deflate", nodata=-9999)
    out = data.copy()
    out[np.isnan(out)] = -9999
    with rasterio.open(path, "w", **profile) as dst:
        dst.write(out.astype(rasterio.float32), 1)