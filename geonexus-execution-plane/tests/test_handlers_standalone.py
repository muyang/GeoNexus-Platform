"""NDVI Handler 独立验证测试（不依赖 geonexus-sdk）。

由于当前环境仅有 Python 3.9，而 geonexus-sdk 需要 >=3.10，
本测试直接验证 NDVI 计算逻辑的正确性，无需完整 GeoMCP 栈。

当 Python 3.12 可用后，完整的端到端测试在 test_handlers_e2e.py 中。
"""

from __future__ import annotations

import tempfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import numpy as np
import pytest
import rasterio
import rasterio.transform

# ---------------------------------------------------------------------------
# 本地 SkillContext polyfill（与 geonexus.geonode.skill.SkillContext 保持一致）
# ---------------------------------------------------------------------------


@dataclass
class SkillContext:
    request_id: str | None = None
    spatial: Any | None = None
    temporal: Any | None = None
    geocards: list[Any] = field(default_factory=list)
    workdir: str | None = None
    node_name: str = "local-node"


# ---------------------------------------------------------------------------
# 从 handlers.py 复制核心函数（避免跨仓库导入依赖）
# ---------------------------------------------------------------------------


def _resolve_output_path(params: dict, context: SkillContext, default_name: str) -> Path:
    output = params.get("output") or params.get("output_path")
    if output:
        return Path(output)
    workdir = Path(context.workdir) if context.workdir else Path(".")
    workdir.mkdir(parents=True, exist_ok=True)
    return workdir / default_name


def _compute_stats(array: np.ndarray) -> dict[str, Any]:
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


def ndvi_handler(params: dict[str, Any], context: SkillContext) -> dict[str, Any]:
    red_path = Path(params["red"])
    nir_path = Path(params["nir"])

    if not red_path.exists():
        raise FileNotFoundError(f"RED band not found: {red_path}")
    if not nir_path.exists():
        raise FileNotFoundError(f"NIR band not found: {nir_path}")

    output_path = _resolve_output_path(params, context, "ndvi.tif")

    with rasterio.open(red_path) as red_src, rasterio.open(nir_path) as nir_src:
        red = red_src.read(1).astype(np.float32)
        nir = nir_src.read(1).astype(np.float32)
        profile = red_src.profile.copy()

    if red.shape != nir.shape:
        raise ValueError(
            f"RED shape {red.shape} != NIR shape {nir.shape}"
        )

    with np.errstate(divide="ignore", invalid="ignore"):
        ndvi = (nir - red) / (nir + red)
    ndvi = np.clip(ndvi, -1.0, 1.0)

    stats = _compute_stats(ndvi)

    profile.update(
        driver="GTiff", dtype=rasterio.float32, count=1,
        compress="deflate", nodata=-9999,
    )
    ndvi_write = ndvi.copy()
    ndvi_write[np.isnan(ndvi_write)] = -9999
    with rasterio.open(output_path, "w", **profile) as dst:
        dst.write(ndvi_write.astype(rasterio.float32), 1)

    return {"ndvi_raster": str(output_path), "stats": stats}


def ndvi_change_handler(params: dict[str, Any], context: SkillContext) -> dict[str, Any]:
    ndvi_a_path = Path(params["ndvi_a"])
    ndvi_b_path = Path(params["ndvi_b"])

    if not ndvi_a_path.exists():
        raise FileNotFoundError(f"NDVI-A not found: {ndvi_a_path}")
    if not ndvi_b_path.exists():
        raise FileNotFoundError(f"NDVI-B not found: {ndvi_b_path}")

    output_path = _resolve_output_path(params, context, "ndvi_change.tif")

    with rasterio.open(ndvi_a_path) as src_a, rasterio.open(ndvi_b_path) as src_b:
        ndvi_a = src_a.read(1).astype(np.float32)
        ndvi_b = src_b.read(1).astype(np.float32)
        profile = src_a.profile.copy()

    if ndvi_a.shape != ndvi_b.shape:
        raise ValueError(f"NDVI-A shape {ndvi_a.shape} != NDVI-B shape {ndvi_b.shape}")

    change = ndvi_b - ndvi_a
    stats = _compute_stats(change)

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

    profile.update(
        driver="GTiff", dtype=rasterio.float32, count=1,
        compress="deflate", nodata=-9999,
    )
    change_write = change.copy()
    change_write[np.isnan(change_write)] = -9999
    with rasterio.open(output_path, "w", **profile) as dst:
        dst.write(change_write.astype(rasterio.float32), 1)

    return {"change_raster": str(output_path), "stats": stats}


# ---------------------------------------------------------------------------
# 测试辅助
# ---------------------------------------------------------------------------

RNG = np.random.default_rng(42)


def _make_band_tif(
    path: str,
    width: int = 64,
    height: int = 64,
    base_value: float = 0.3,
    noise_scale: float = 0.1,
) -> str:
    data = np.full((height, width), base_value, dtype=np.float32)
    data += RNG.normal(0, noise_scale, (height, width)).astype(np.float32)
    profile = {
        "driver": "GTiff",
        "dtype": rasterio.float32,
        "count": 1,
        "width": width,
        "height": height,
        "crs": "EPSG:4326",
        "transform": rasterio.transform.from_bounds(
            -74.0, -15.0, -44.0, 5.0, width, height
        ),
    }
    with rasterio.open(path, "w", **profile) as dst:
        dst.write(data, 1)
    return path


def _read_raster(path: str) -> np.ndarray:
    with rasterio.open(path) as src:
        return src.read(1)


# ---------------------------------------------------------------------------
# 测试
# ---------------------------------------------------------------------------


class TestNDVIHandlerStandalone:
    """验证 NDVI handler 计算逻辑（无 SDK 依赖）。"""

    def test_ndvi_perfect_vegetation(self, tmp_path):
        """RED=0.1, NIR=0.7 → NDVI=(0.7-0.1)/(0.7+0.1)=0.75"""
        red = str(tmp_path / "red.tif")
        nir = str(tmp_path / "nir.tif")
        _make_band_tif(red, base_value=0.1, noise_scale=0.0)
        _make_band_tif(nir, base_value=0.7, noise_scale=0.0)

        ctx = SkillContext(workdir=str(tmp_path))
        result = ndvi_handler({"red": red, "nir": nir}, ctx)

        expected = (0.7 - 0.1) / (0.7 + 0.1)  # = 0.75
        stats = result["stats"]
        assert abs(stats["mean"] - expected) < 0.01
        assert stats["pixels"] == 4096

        # 输出可被 rasterio 读取
        ndvi_data = _read_raster(result["ndvi_raster"])
        assert ndvi_data.shape == (64, 64)
        assert float(ndvi_data.mean()) == pytest.approx(expected, abs=0.01)

    def test_ndvi_bare_soil(self, tmp_path):
        """RED=0.3, NIR=0.35 → NDVI≈0.077（裸土）"""
        red = str(tmp_path / "red.tif")
        nir = str(tmp_path / "nir.tif")
        _make_band_tif(red, base_value=0.30, noise_scale=0.0)
        _make_band_tif(nir, base_value=0.35, noise_scale=0.0)

        ctx = SkillContext(workdir=str(tmp_path))
        result = ndvi_handler({"red": red, "nir": nir}, ctx)

        expected = (0.35 - 0.3) / (0.35 + 0.3)  # ≈ 0.077
        assert abs(result["stats"]["mean"] - expected) < 0.01

    def test_ndvi_water(self, tmp_path):
        """RED=0.5, NIR=0.1 → NDVI≈-0.67（水体）"""
        red = str(tmp_path / "red.tif")
        nir = str(tmp_path / "nir.tif")
        _make_band_tif(red, base_value=0.5, noise_scale=0.0)
        _make_band_tif(nir, base_value=0.1, noise_scale=0.0)

        ctx = SkillContext(workdir=str(tmp_path))
        result = ndvi_handler({"red": red, "nir": nir}, ctx)

        expected = (0.1 - 0.5) / (0.1 + 0.5)  # ≈ -0.667
        assert abs(result["stats"]["mean"] - expected) < 0.01
        assert result["stats"]["min"] < 0  # 负值 = 水体特征

    def test_ndvi_clamped_to_range(self, tmp_path):
        """NDVI 被裁剪到 [-1, 1] 范围。"""
        red = str(tmp_path / "red.tif")
        nir = str(tmp_path / "nir.tif")
        _make_band_tif(red, base_value=0.2, noise_scale=0.15)
        _make_band_tif(nir, base_value=0.6, noise_scale=0.15)

        ctx = SkillContext(workdir=str(tmp_path))
        result = ndvi_handler({"red": red, "nir": nir}, ctx)

        ndvi_data = _read_raster(result["ndvi_raster"])
        assert float(ndvi_data.min()) >= -1.0
        assert float(ndvi_data.max()) <= 1.0

    def test_missing_input_raises(self, tmp_path):
        """缺少输入文件时报错。"""
        ctx = SkillContext(workdir=str(tmp_path))
        with pytest.raises(FileNotFoundError):
            ndvi_handler({"red": "/nonexistent/red.tif", "nir": "/nonexistent/nir.tif"}, ctx)

    def test_shape_mismatch_raises(self, tmp_path):
        """不同尺寸的红/近红外波段报错。"""
        red = str(tmp_path / "red.tif")
        nir = str(tmp_path / "nir.tif")
        _make_band_tif(red, width=64, height=64)
        _make_band_tif(nir, width=32, height=32)

        ctx = SkillContext(workdir=str(tmp_path))
        with pytest.raises(ValueError, match="shape"):
            ndvi_handler({"red": red, "nir": nir}, ctx)

    def test_custom_output_path(self, tmp_path):
        """自定义输出路径。"""
        red = str(tmp_path / "red.tif")
        nir = str(tmp_path / "nir.tif")
        out = str(tmp_path / "custom_ndvi.tif")
        _make_band_tif(red, base_value=0.2, noise_scale=0.0)
        _make_band_tif(nir, base_value=0.6, noise_scale=0.0)

        ctx = SkillContext(workdir=str(tmp_path))
        result = ndvi_handler({"red": red, "nir": nir, "output": out}, ctx)
        assert result["ndvi_raster"] == out
        assert _read_raster(out).shape == (64, 64)


class TestNDVIChangeHandlerStandalone:
    """验证变化检测 handler 计算逻辑。"""

    def test_vegetation_loss_detected(self, tmp_path):
        """2015 高植被 → 2025 低植被 = 检测到损失。"""
        # 模拟 2015 和 2025 NDVI
        ndvi_2015 = str(tmp_path / "ndvi_2015.tif")
        ndvi_2025 = str(tmp_path / "ndvi_2025.tif")
        _make_band_tif(ndvi_2015, base_value=0.75, noise_scale=0.05)  # 高植被
        _make_band_tif(ndvi_2025, base_value=0.40, noise_scale=0.05)  # 低植被

        ctx = SkillContext(workdir=str(tmp_path))
        result = ndvi_change_handler({"ndvi_a": ndvi_2015, "ndvi_b": ndvi_2025}, ctx)

        stats = result["stats"]
        assert stats["mean"] < 0  # 净损失
        assert stats["loss_area_pct"] > stats["gain_area_pct"]

        change_data = _read_raster(result["change_raster"])
        assert change_data.shape == (64, 64)

    def test_vegetation_gain_detected(self, tmp_path):
        """2015 低植被 → 2025 高植被 = 检测到增益。"""
        ndvi_2015 = str(tmp_path / "ndvi_2015.tif")
        ndvi_2025 = str(tmp_path / "ndvi_2025.tif")
        _make_band_tif(ndvi_2015, base_value=0.30, noise_scale=0.05)
        _make_band_tif(ndvi_2025, base_value=0.70, noise_scale=0.05)

        ctx = SkillContext(workdir=str(tmp_path))
        result = ndvi_change_handler({"ndvi_a": ndvi_2015, "ndvi_b": ndvi_2025}, ctx)

        stats = result["stats"]
        assert stats["mean"] > 0
        assert stats["gain_area_pct"] > stats["loss_area_pct"]

    def test_no_change_stable(self, tmp_path):
        """相同植被 = 变化接近零。"""
        ndvi_a = str(tmp_path / "ndvi_a.tif")
        ndvi_b = str(tmp_path / "ndvi_b.tif")
        _make_band_tif(ndvi_a, base_value=0.60, noise_scale=0.02)
        _make_band_tif(ndvi_b, base_value=0.60, noise_scale=0.02)

        ctx = SkillContext(workdir=str(tmp_path))
        result = ndvi_change_handler({"ndvi_a": ndvi_a, "ndvi_b": ndvi_b}, ctx)

        stats = result["stats"]
        assert abs(stats["mean"]) < 0.15
        assert stats["no_change_pct"] > 50


class TestNDVIPipelineStandalone:
    """完整 NDVI → 变化检测工作流。"""

    def test_full_pipeline(self, tmp_path):
        """RED/NIR → NDVI 2015 → NDVI 2025 → 变化检测。"""
        ctx = SkillContext(workdir=str(tmp_path))

        # 生成 2015 数据（高植被）
        red_2015 = str(tmp_path / "red_2015.tif")
        nir_2015 = str(tmp_path / "nir_2015.tif")
        _make_band_tif(red_2015, base_value=0.10, noise_scale=0.03)
        _make_band_tif(nir_2015, base_value=0.70, noise_scale=0.03)

        # 生成 2025 数据（低植被 — 砍伐模拟）
        red_2025 = str(tmp_path / "red_2025.tif")
        nir_2025 = str(tmp_path / "nir_2025.tif")
        _make_band_tif(red_2025, base_value=0.25, noise_scale=0.03)
        _make_band_tif(nir_2025, base_value=0.50, noise_scale=0.03)

        # Step 1: NDVI 2015
        ndvi_2015 = ndvi_handler(
            {"red": red_2015, "nir": nir_2015,
             "output": str(tmp_path / "ndvi_2015.tif")}, ctx
        )
        assert ndvi_2015["stats"]["mean"] > 0.5  # 高植被

        # Step 2: NDVI 2025
        ndvi_2025 = ndvi_handler(
            {"red": red_2025, "nir": nir_2025,
             "output": str(tmp_path / "ndvi_2025.tif")}, ctx
        )
        assert ndvi_2025["stats"]["mean"] < ndvi_2015["stats"]["mean"]

        # Step 3: 变化检测
        change = ndvi_change_handler(
            {"ndvi_a": ndvi_2015["ndvi_raster"],
             "ndvi_b": ndvi_2025["ndvi_raster"],
             "output": str(tmp_path / "change.tif")}, ctx
        )

        # 验证：应该有植被退化
        assert change["stats"]["mean"] < 0
        assert change["stats"]["loss_area_pct"] > 0
        assert Path(change["change_raster"]).exists()

        # 验证输出 GeoTIFF 有正确的元数据
        with rasterio.open(change["change_raster"]) as src:
            assert src.crs == "EPSG:4326"
            assert src.count == 1
            assert src.dtypes[0] == "float32"
            bounds = src.bounds
            assert bounds.left == pytest.approx(-74.0)
            assert bounds.bottom == pytest.approx(-15.0)