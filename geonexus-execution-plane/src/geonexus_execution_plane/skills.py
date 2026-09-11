"""GeoNexus Execution Plane — 内建技能。

Java 团队不需要关心这些技能的实现细节，它们由 Python 专人维护，
通过 GeoMCP 的 geo.capabilities 暴露给调用方。

handler 全部指向 handlers 模块中的真实实现。
"""

from geonexus.geonode import Skill

from .handlers import (
    ndvi_change_handler,
    ndvi_handler,
    terrain_aspect_handler,
    terrain_slope_handler,
)


# ── NDVI 分析 ──

NDVI_SKILL = Skill(
    name="ndvi-analysis",
    description="Compute NDVI (Normalized Difference Vegetation Index) from red/NIR rasters.",
    input_schema={
        "type": "object",
        "required": ["red", "nir"],
        "properties": {
            "red": {"type": "string", "description": "Red band raster path (GeoTIFF)"},
            "nir": {"type": "string", "description": "NIR band raster path (GeoTIFF)"},
            "output": {"type": "string", "description": "Optional output path for NDVI result"},
        },
    },
    output_schema={
        "type": "object",
        "properties": {
            "ndvi_raster": {"type": "string", "description": "Path to NDVI result GeoTIFF"},
            "stats": {
                "type": "object",
                "description": "Statistics: mean, std, min, max, pixels",
            },
        },
    },
    handler=ndvi_handler,
)

# ── 变化检测 ──

CHANGE_DETECTION_SKILL = Skill(
    name="ndvi-change",
    description="Compute NDVI change between two time steps (2025 - 2015). GPU-accelerated.",
    input_schema={
        "type": "object",
        "required": ["ndvi_a", "ndvi_b"],
        "properties": {
            "ndvi_a": {"type": "string", "description": "NDVI raster for earlier time step"},
            "ndvi_b": {"type": "string", "description": "NDVI raster for later time step"},
            "output": {"type": "string", "description": "Optional output path"},
        },
    },
    output_schema={
        "type": "object",
        "properties": {
            "change_raster": {"type": "string", "description": "Path to change raster GeoTIFF"},
            "stats": {
                "type": "object",
                "description": "Change statistics: mean_change, gain_area_pct, loss_area_pct",
            },
        },
    },
    handler=ndvi_change_handler,
)

# ── 地形分析（坡度） ──

TERRAIN_SLOPE_SKILL = Skill(
    name="terrain-slope",
    description="Compute terrain slope from DEM. Delegates to OGE Coverage.terrSlope when available.",
    input_schema={
        "type": "object",
        "required": ["coverage"],
        "properties": {
            "coverage": {"type": "string", "description": "DEM coverage reference (OGE or local path)"},
            "outputName": {"type": "string", "description": "Output raster name"},
        },
    },
    output_schema={
        "type": "object",
        "properties": {
            "slope_raster": {"type": "string", "description": "Path to slope result GeoTIFF"},
            "process_id": {"type": "string", "description": "OGE process ID (if delegated)"},
        },
    },
    handler=terrain_slope_handler,
)

# ── 地形分析（坡向） ──

TERRAIN_ASPECT_SKILL = Skill(
    name="terrain-aspect",
    description="Compute terrain aspect from DEM. Delegates to OGE Coverage.terrAspect when available.",
    input_schema={
        "type": "object",
        "required": ["coverage"],
        "properties": {
            "coverage": {"type": "string", "description": "DEM coverage reference"},
            "outputName": {"type": "string", "description": "Output raster name"},
        },
    },
    output_schema={
        "type": "object",
        "properties": {
            "aspect_raster": {"type": "string", "description": "Path to aspect result GeoTIFF"},
            "process_id": {"type": "string", "description": "OGE process ID (if delegated)"},
        },
    },
    handler=terrain_aspect_handler,
)

# ── 内建技能列表 ──

BUILTIN_SKILLS = [
    NDVI_SKILL,
    CHANGE_DETECTION_SKILL,
    TERRAIN_SLOPE_SKILL,
    TERRAIN_ASPECT_SKILL,
]