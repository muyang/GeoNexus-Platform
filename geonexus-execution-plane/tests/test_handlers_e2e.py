"""端到端测试：NDVI 技能通过 GeoMCP HTTP 调用真实 rasterio handler。

验证：
1. 生成模拟红/近红外波段 GeoTIFF
2. 启动 GeoNode + 注册技能
3. geo.execute("ndvi-analysis", ...) 返回正确 NDVI 结果
4. 输出 GeoTIFF 可被 rasterio 重新读取验证
"""

from __future__ import annotations

import numpy as np
import pytest
import rasterio
from geonexus.geomcp import GeoMCPClient, GeoMCPClientError
from geonexus.geonode import GeoNode
from geonexus.geonode.skill import SkillContext

from geonexus_execution_plane.handlers import ndvi_handler
from geonexus_execution_plane.skills import (
    CHANGE_DETECTION_SKILL,
    NDVI_SKILL,
)

# ---------------------------------------------------------------------------
# 测试辅助：生成模拟波段 GeoTIFF
# ---------------------------------------------------------------------------


def _make_band_tif(path: str, width: int = 64, height: int = 64,
                   base_value: float = 0.3, noise_scale: float = 0.1) -> str:
    """生成单波段 Float32 GeoTIFF 用于测试。"""
    rng = np.random.default_rng(42)
    data = np.full((height, width), base_value, dtype=np.float32)
    data += rng.normal(0, noise_scale, (height, width)).astype(np.float32)

    profile = {
        "driver": "GTiff",
        "dtype": rasterio.float32,
        "count": 1,
        "width": width,
        "height": height,
        "crs": "EPSG:4326",
        "transform": rasterio.transform.from_bounds(-74.0, -15.0, -44.0, 5.0, width, height),
    }
    with rasterio.open(path, "w", **profile) as dst:
        dst.write(data, 1)
    return path


def _read_raster(path: str) -> np.ndarray:
    """读取 GeoTIFF 第一个波段为 numpy 数组。"""
    with rasterio.open(path) as src:
        return src.read(1)


# ---------------------------------------------------------------------------
# 单元测试：handler 直接调用
# ---------------------------------------------------------------------------


class TestNDVIHandlerDirect:
    """直接调用 handler 函数（不走 HTTP），验证计算正确性。"""

    def test_ndvi_computation(self, tmp_path):
        """NDVI = (NIR-RED)/(NIR+RED) 计算正确。"""
        red_path = str(tmp_path / "red.tif")
        nir_path = str(tmp_path / "nir.tif")
        _make_band_tif(red_path, base_value=0.2, noise_scale=0.0)
        _make_band_tif(nir_path, base_value=0.6, noise_scale=0.0)

        ctx = SkillContext(workdir=str(tmp_path), node_name="test")
        result = ndvi_handler({"red": red_path, "nir": nir_path}, ctx)

        # 验证输出路径
        ndvi_path = result["ndvi_raster"]
        assert ndvi_path.endswith("ndvi.tif")

        # 验证统计
        stats = result["stats"]
        expected_ndvi = (0.6 - 0.2) / (0.6 + 0.2)  # = 0.5
        assert abs(stats["mean"] - expected_ndvi) < 0.01
        assert stats["pixels"] == 4096  # 64×64

        # 验证输出 GeoTIFF 可读，NDVI 值在 [-1, 1]
        ndvi_data = _read_raster(ndvi_path)
        assert ndvi_data.shape == (64, 64)
        assert float(ndvi_data.mean()) == pytest.approx(expected_ndvi, abs=0.01)

    def test_ndvi_noise_realistic(self, tmp_path):
        """带噪声的模拟数据产生合理的 NDVI 范围。"""
        red_path = str(tmp_path / "red.tif")
        nir_path = str(tmp_path / "nir.tif")
        _make_band_tif(red_path, base_value=0.15, noise_scale=0.05)
        _make_band_tif(nir_path, base_value=0.55, noise_scale=0.05)

        ctx = SkillContext(workdir=str(tmp_path), node_name="test")
        result = ndvi_handler({"red": red_path, "nir": nir_path}, ctx)

        stats = result["stats"]
        assert 0.1 < stats["mean"] < 0.9
        assert -1.0 <= stats["min"] <= 1.0
        assert -1.0 <= stats["max"] <= 1.0

    def test_missing_input_file(self, tmp_path):
        """缺少输入文件时抛出 FileNotFoundError。"""
        ctx = SkillContext(workdir=str(tmp_path))
        with pytest.raises(FileNotFoundError):
            ndvi_handler(
                {"red": "/nonexistent/red.tif", "nir": "/nonexistent/nir.tif"}, ctx
            )

    def test_custom_output_path(self, tmp_path):
        """支持自定义输出路径。"""
        red_path = str(tmp_path / "red.tif")
        nir_path = str(tmp_path / "nir.tif")
        out_path = str(tmp_path / "my_custom_ndvi.tif")
        _make_band_tif(red_path, base_value=0.2, noise_scale=0.0)
        _make_band_tif(nir_path, base_value=0.6, noise_scale=0.0)

        ctx = SkillContext(workdir=str(tmp_path))
        result = ndvi_handler(
            {"red": red_path, "nir": nir_path, "output": out_path}, ctx
        )

        assert result["ndvi_raster"] == out_path
        assert _read_raster(out_path).shape == (64, 64)


# ---------------------------------------------------------------------------
# 端到端测试：通过 GeoMCP HTTP 调用
# ---------------------------------------------------------------------------


def _start_e2e_node(tmp_path, port: int = 0):
    """启动一个注册了真实技能的 GeoNode。"""
    node = GeoNode(name="e2e-test-node", port=port, workdir=str(tmp_path))
    node.register_skill_object(NDVI_SKILL)
    node.register_skill_object(CHANGE_DETECTION_SKILL)
    running = node.start_in_thread(port=port)
    running.wait_until_ready()
    return node, running


class TestNDVIEndToEnd:
    """通过 GeoMCP HTTP 调用真实 handler 的端到端测试。"""

    def test_geo_execute_ndvi(self, tmp_path):
        """geo.execute("ndvi-analysis") → 真实 rasterio handler → 正确结果。"""
        # 准备测试数据
        red_path = str(tmp_path / "red.tif")
        nir_path = str(tmp_path / "nir.tif")
        _make_band_tif(red_path, base_value=0.2, noise_scale=0.1)
        _make_band_tif(nir_path, base_value=0.6, noise_scale=0.1)
        expected_ndvi = (0.6 - 0.2) / (0.6 + 0.2)  # ≈ 0.5

        # 启动节点
        _, running = _start_e2e_node(tmp_path)
        port = running.port
        try:
            with GeoMCPClient(f"http://127.0.0.1:{port}", timeout=30) as client:
                # 健康检查
                health = client.health()
                assert health["status"] == "ok"

                # 能力查询
                caps = client.capabilities()
                assert any(s["name"] == "ndvi-analysis" for s in caps["skills"])

                # 执行 NDVI
                result = client.execute(
                    skill="ndvi-analysis",
                    params={"red": red_path, "nir": nir_path},
                    request_id="e2e-001",
                )

                assert result["status"] == "ok"
                assert result["skill"] == "ndvi-analysis"

                # 验证统计
                stats = result["outputs"]["stats"]
                assert stats["pixels"] == 4096
                assert abs(stats["mean"] - expected_ndvi) < 0.15

                # 验证输出 GeoTIFF
                ndvi_path = result["outputs"]["ndvi_raster"]
                ndvi_data = _read_raster(ndvi_path)
                assert ndvi_data.shape == (64, 64)
                assert -1.0 <= float(ndvi_data.min()) <= 1.0
                assert -1.0 <= float(ndvi_data.max()) <= 1.0

        finally:
            running.stop()

    def test_geo_execute_unknown_skill(self, tmp_path):
        """调用未注册的技能返回错误码 2001。"""
        _, running = _start_e2e_node(tmp_path)
        port = running.port
        try:
            with GeoMCPClient(f"http://127.0.0.1:{port}", timeout=10) as client:
                with pytest.raises(GeoMCPClientError) as exc_info:
                    client.execute(skill="does-not-exist", request_id="e2e-002")
                assert exc_info.value.code == 2001
        finally:
            running.stop()

    def test_geo_execute_missing_params(self, tmp_path):
        """缺少必填参数时返回 JSON-RPC 错误码 -32602 (INVALID_PARAMS)。"""
        _, running = _start_e2e_node(tmp_path)
        port = running.port
        try:
            with GeoMCPClient(f"http://127.0.0.1:{port}", timeout=10) as client:
                with pytest.raises(GeoMCPClientError) as exc_info:
                    client.execute(
                        skill="ndvi-analysis",
                        params={"red": "/nonexistent.tif"},  # 缺少 nir
                        request_id="e2e-003",
                    )
                assert exc_info.value.code == -32602
        finally:
            running.stop()

    def test_capabilities_list_skills(self, tmp_path):
        """geo.capabilities 返回 e2e 节点注册的技能（含 schema）。"""
        _, running = _start_e2e_node(tmp_path)
        port = running.port
        try:
            with GeoMCPClient(f"http://127.0.0.1:{port}", timeout=10) as client:
                caps = client.capabilities()
                skill_names = {s["name"] for s in caps["skills"]}
                assert "ndvi-analysis" in skill_names
                assert "ndvi-change" in skill_names

                # 验证 schema 暴露
                ndvi_skill = next(s for s in caps["skills"] if s["name"] == "ndvi-analysis")
                assert "red" in ndvi_skill["input_schema"].get("required", [])
                assert "nir" in ndvi_skill["input_schema"].get("required", [])
        finally:
            running.stop()

    def test_ndvi_change_workflow(self, tmp_path):
        """完整 NDVI → 变化检测工作流。"""
        # 生成两对红/近红外（模拟 2015 和 2025）
        red_2015 = str(tmp_path / "red_2015.tif")
        nir_2015 = str(tmp_path / "nir_2015.tif")
        red_2025 = str(tmp_path / "red_2025.tif")
        nir_2025 = str(tmp_path / "nir_2025.tif")

        # 2015: 更多植被 (RED↓, NIR↑)
        _make_band_tif(red_2015, base_value=0.10, noise_scale=0.03)
        _make_band_tif(nir_2015, base_value=0.70, noise_scale=0.03)

        # 2025: 植被减少 (RED↑, NIR↓)
        _make_band_tif(red_2025, base_value=0.25, noise_scale=0.03)
        _make_band_tif(nir_2025, base_value=0.50, noise_scale=0.03)

        _, running = _start_e2e_node(tmp_path)
        port = running.port
        try:
            with GeoMCPClient(f"http://127.0.0.1:{port}", timeout=30) as client:
                # Step 1: NDVI 2015
                ndvi_2015 = client.execute(
                    skill="ndvi-analysis",
                    params={"red": red_2015, "nir": nir_2015,
                            "output": str(tmp_path / "ndvi_2015.tif")},
                    request_id="wf-001",
                )
                assert ndvi_2015["status"] == "ok"
                ndvi_2015_mean = ndvi_2015["outputs"]["stats"]["mean"]

                # Step 2: NDVI 2025
                ndvi_2025 = client.execute(
                    skill="ndvi-analysis",
                    params={"red": red_2025, "nir": nir_2025,
                            "output": str(tmp_path / "ndvi_2025.tif")},
                    request_id="wf-002",
                )
                assert ndvi_2025["status"] == "ok"
                ndvi_2025_mean = ndvi_2025["outputs"]["stats"]["mean"]

                # Step 3: 变化检测
                change = client.execute(
                    skill="ndvi-change",
                    params={
                        "ndvi_a": ndvi_2015["outputs"]["ndvi_raster"],
                        "ndvi_b": ndvi_2025["outputs"]["ndvi_raster"],
                        "output": str(tmp_path / "change.tif"),
                    },
                    request_id="wf-003",
                )
                assert change["status"] == "ok"

                # 验证变化方向：2025 NDVI 应该低于 2015
                change_stats = change["outputs"]["stats"]
                assert change_stats["mean"] < 0  # 负变化
                assert ndvi_2025_mean < ndvi_2015_mean  # 植被退化

                # 验证变化 GeoTIFF
                change_data = _read_raster(change["outputs"]["change_raster"])
                assert change_data.shape == (64, 64)

        finally:
            running.stop()