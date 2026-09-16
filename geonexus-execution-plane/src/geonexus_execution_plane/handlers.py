"""GeoNexus Execution Plane — 内建技能的真实 handler 实现。

每个 handler 遵循 GeoSkill 契约：
    handler(params: dict, context: SkillContext) -> dict

本模块中的 handler 是 Python 执行面的"算"能力核心。
Java 团队不需要关心这些实现细节，它们通过 GeoMCP 的 geo.execute 暴露。
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

import numpy as np
import rasterio
from geonexus.geonode.skill import SkillContext

logger = logging.getLogger("geonexus.execution_plane.handlers")

# ---------------------------------------------------------------------------
# 工具函数
# ---------------------------------------------------------------------------


def _resolve_output_path(params: dict[str, Any], context: SkillContext,
                         default_name: str) -> Path:
    """解析输出路径：优先 params['output']，其次 context.workdir。"""
    output = params.get("output") or params.get("output_path")
    if output:
        return Path(output)
    workdir = Path(context.workdir) if context.workdir else Path(".")
    workdir.mkdir(parents=True, exist_ok=True)
    return workdir / default_name


def _compute_stats(array: np.ndarray) -> dict[str, Any]:
    """计算栅格统计信息。"""
    valid = array[~np.isnan(array)]
    if valid.size == 0:
        return {"mean": None, "std": None, "min": None, "max": None, "pixels": 0}
    return {
        "mean": float(valid.mean()),
        "std": float(valid.std()),
        "min": float(valid.min()),
        "max": float(valid.max()),
        "pixels": int(valid.size),
    }


# ---------------------------------------------------------------------------
# NDVI 分析 handler
# ---------------------------------------------------------------------------

def ndvi_handler(params: dict[str, Any], context: SkillContext) -> dict[str, Any]:
    """计算 NDVI (归一化植被指数)。

    params 必须包含:
        red: str  — 红光波段 GeoTIFF 路径
        nir: str  — 近红外波段 GeoTIFF 路径
        output: str (可选) — 输出 GeoTIFF 路径

    返回:
        {"ndvi_raster": str, "stats": {...}}
    """
    red_path = Path(params["red"])
    nir_path = Path(params["nir"])

    if not red_path.exists():
        raise FileNotFoundError(f"RED band not found: {red_path}")
    if not nir_path.exists():
        raise FileNotFoundError(f"NIR band not found: {nir_path}")

    output_path = _resolve_output_path(params, context, "ndvi.tif")
    logger.info("NDVI: red=%s nir=%s output=%s", red_path, nir_path, output_path)

    # 读取波段
    with rasterio.open(red_path) as red_src, rasterio.open(nir_path) as nir_src:
        red = red_src.read(1).astype(np.float32)
        nir = nir_src.read(1).astype(np.float32)
        profile = red_src.profile.copy()

    # 验证数组尺寸一致
    if red.shape != nir.shape:
        raise ValueError(
            f"RED shape {red.shape} != NIR shape {nir.shape}. "
            f"Bands must have the same dimensions."
        )

    # 计算 NDVI = (NIR - RED) / (NIR + RED)
    # 避免除零：np.errstate 抑制警告，无效值设为 NaN
    with np.errstate(divide="ignore", invalid="ignore"):
        ndvi = (nir - red) / (nir + red)
    ndvi = np.clip(ndvi, -1.0, 1.0)

    # 统计
    stats = _compute_stats(ndvi)

    # 写入输出
    profile.update(
        driver="GTiff",
        dtype=rasterio.float32,
        count=1,
        compress="deflate",
        nodata=-9999,
    )
    ndvi_write = ndvi.copy()
    ndvi_write[np.isnan(ndvi_write)] = -9999
    with rasterio.open(output_path, "w", **profile) as dst:
        dst.write(ndvi_write.astype(rasterio.float32), 1)

    logger.info("NDVI: done. mean=%.4f std=%.4f pixels=%d",
                stats["mean"] or 0, stats["std"] or 0, stats["pixels"])

    return {
        "ndvi_raster": str(output_path),
        "stats": stats,
    }


# ---------------------------------------------------------------------------
# NDVI 变化检测 handler
# ---------------------------------------------------------------------------

def ndvi_change_handler(params: dict[str, Any], context: SkillContext) -> dict[str, Any]:
    """计算两个时相的 NDVI 变化 (ndvi_b - ndvi_a)。

    params 必须包含:
        ndvi_a: str  — 早期 NDVI GeoTIFF 路径
        ndvi_b: str  — 后期 NDVI GeoTIFF 路径
        output: str (可选) — 输出 GeoTIFF 路径

    返回:
        {"change_raster": str, "stats": {...}}
    """
    ndvi_a_path = Path(params["ndvi_a"])
    ndvi_b_path = Path(params["ndvi_b"])

    if not ndvi_a_path.exists():
        raise FileNotFoundError(f"NDVI-A not found: {ndvi_a_path}")
    if not ndvi_b_path.exists():
        raise FileNotFoundError(f"NDVI-B not found: {ndvi_b_path}")

    output_path = _resolve_output_path(params, context, "ndvi_change.tif")
    logger.info("NDVI-CHANGE: a=%s b=%s output=%s", ndvi_a_path, ndvi_b_path, output_path)

    with rasterio.open(ndvi_a_path) as src_a, rasterio.open(ndvi_b_path) as src_b:
        ndvi_a = src_a.read(1).astype(np.float32)
        ndvi_b = src_b.read(1).astype(np.float32)
        profile = src_a.profile.copy()

    if ndvi_a.shape != ndvi_b.shape:
        raise ValueError(
            f"NDVI-A shape {ndvi_a.shape} != NDVI-B shape {ndvi_b.shape}"
        )

    change = ndvi_b - ndvi_a

    # 统计
    stats = _compute_stats(change)
    # 附加增益/损失比例
    valid = change[~np.isnan(change)]
    if valid.size > 0:
        stats["gain_area_pct"] = float((valid > 0.05).sum() / valid.size * 100)
        stats["loss_area_pct"] = float((valid < -0.05).sum() / valid.size * 100)
        stats["no_change_pct"] = float(
            ((valid >= -0.05) & (valid <= 0.05)).sum() / valid.size * 100
        )
    else:
        stats["gain_area_pct"] = 0.0
        stats["loss_area_pct"] = 0.0
        stats["no_change_pct"] = 0.0

    # 写出
    profile.update(
        driver="GTiff",
        dtype=rasterio.float32,
        count=1,
        compress="deflate",
        nodata=-9999,
    )
    change_write = change.copy()
    change_write[np.isnan(change_write)] = -9999
    with rasterio.open(output_path, "w", **profile) as dst:
        dst.write(change_write.astype(rasterio.float32), 1)

    logger.info("NDVI-CHANGE: done. mean=%.4f gain=%.1f%% loss=%.1f%%",
                stats.get("mean") or 0, stats["gain_area_pct"], stats["loss_area_pct"])

    return {
        "change_raster": str(output_path),
        "stats": stats,
    }


# ---------------------------------------------------------------------------
# 地形分析 handler（占位 — 实际依赖 OGE 计算中心）
# ---------------------------------------------------------------------------

def terrain_slope_handler(params: dict[str, Any], context: SkillContext) -> dict[str, Any]:
    """坡度分析占位 handler。

    当 OGE 未配置时，此 handler 返回提示信息；
    当 OGE 已配置时，实际执行会路由到 OgeExecutor。
    """
    return {
        "slope_raster": None,
        "process_id": None,
        "message": (
            "terrain-slope requires an OGE computing center backend. "
            "Set GEONEXUS_OGE_ENDPOINT to enable remote execution."
        ),
        "status": "deferred",
    }


def terrain_aspect_handler(params: dict[str, Any], context: SkillContext) -> dict[str, Any]:
    """坡向分析占位 handler。"""
    return {
        "aspect_raster": None,
        "process_id": None,
        "message": (
            "terrain-aspect requires an OGE computing center backend. "
            "Set GEONEXUS_OGE_ENDPOINT to enable remote execution."
        ),
        "status": "deferred",
    }