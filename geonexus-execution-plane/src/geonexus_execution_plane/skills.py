"""GeoNexus Execution Plane — 内建技能（12 个）。

Java 团队不需要关心这些技能的实现细节，它们由 Python 专人维护，
通过 GeoMCP 的 geo.capabilities 暴露给调用方。

技能清单:
- ndvi-analysis   : 归一化植被指数
- ndvi-change     : 植被变化检测
- terrain-slope   : 坡度分析 (OGE)
- terrain-aspect  : 坡向分析 (OGE)
- ndwi-analysis   : 归一化水体指数
- evi-analysis    : 增强植被指数
- ndbi-analysis   : 归一化建筑指数
- buffer-analysis : 空间缓冲区
- zonal-stats     : 分区统计
- reproject       : 坐标系统转换
- clip-crop       : 栅格裁剪
- composite-bands : 波段合成
"""

from geonexus.geonode import Skill

from .extended_handlers import (
    buffer_handler,
    clip_handler,
    composite_handler,
    evi_handler,
    ndbi_handler,
    ndwi_handler,
    reproject_handler,
    zonal_stats_handler,
)
from .handlers import (
    ndvi_change_handler,
    ndvi_handler,
    terrain_aspect_handler,
    terrain_slope_handler,
)

# ── 原有技能 ──

NDVI_SKILL = Skill(
    name="ndvi-analysis",
    description="Compute NDVI (Normalized Difference Vegetation Index) from red/NIR rasters.",
    input_schema={
        "type": "object", "required": ["red", "nir"],
        "properties": {"red": {"type": "string"}, "nir": {"type": "string"}, "output": {"type": "string"}},
    },
    output_schema={"type": "object", "properties": {"ndvi_raster": {"type": "string"}, "stats": {"type": "object"}}},
    handler=ndvi_handler,
)

CHANGE_DETECTION_SKILL = Skill(
    name="ndvi-change",
    description="Compute NDVI change between two time steps. GPU-accelerated.",
    input_schema={
        "type": "object", "required": ["ndvi_a", "ndvi_b"],
        "properties": {"ndvi_a": {"type": "string"}, "ndvi_b": {"type": "string"}, "output": {"type": "string"}},
    },
    output_schema={"type": "object", "properties": {"change_raster": {"type": "string"}, "stats": {"type": "object"}}},
    handler=ndvi_change_handler,
)

TERRAIN_SLOPE_SKILL = Skill(
    name="terrain-slope",
    description="Compute terrain slope from DEM. Delegates to OGE when available.",
    input_schema={
        "type": "object", "required": ["coverage"],
        "properties": {"coverage": {"type": "string"}, "outputName": {"type": "string"}},
    },
    output_schema={"type": "object", "properties": {"slope_raster": {"type": "string"}, "process_id": {"type": "string"}}},
    handler=terrain_slope_handler,
)

TERRAIN_ASPECT_SKILL = Skill(
    name="terrain-aspect",
    description="Compute terrain aspect from DEM. Delegates to OGE when available.",
    input_schema={
        "type": "object", "required": ["coverage"],
        "properties": {"coverage": {"type": "string"}, "outputName": {"type": "string"}},
    },
    output_schema={"type": "object", "properties": {"aspect_raster": {"type": "string"}, "process_id": {"type": "string"}}},
    handler=terrain_aspect_handler,
)

# ── 新增 P0 技能 ──

NDWI_SKILL = Skill(
    name="ndwi-analysis",
    description="Compute NDWI (Normalized Difference Water Index) — water body extraction.",
    input_schema={
        "type": "object", "required": ["green", "nir"],
        "properties": {"green": {"type": "string"}, "nir": {"type": "string"}, "output": {"type": "string"}},
    },
    output_schema={"type": "object", "properties": {"ndwi_raster": {"type": "string"}, "stats": {"type": "object"}}},
    handler=ndwi_handler,
)

EVI_SKILL = Skill(
    name="evi-analysis",
    description="Compute EVI (Enhanced Vegetation Index) — reduced atmospheric/soil effects.",
    input_schema={
        "type": "object", "required": ["red", "nir", "blue"],
        "properties": {"red": {"type": "string"}, "nir": {"type": "string"}, "blue": {"type": "string"}, "output": {"type": "string"}},
    },
    output_schema={"type": "object", "properties": {"evi_raster": {"type": "string"}, "stats": {"type": "object"}}},
    handler=evi_handler,
)

NDBI_SKILL = Skill(
    name="ndbi-analysis",
    description="Compute NDBI (Normalized Difference Built-up Index) — urban area extraction.",
    input_schema={
        "type": "object", "required": ["swir", "nir"],
        "properties": {"swir": {"type": "string"}, "nir": {"type": "string"}, "output": {"type": "string"}},
    },
    output_schema={"type": "object", "properties": {"ndbi_raster": {"type": "string"}, "stats": {"type": "object"}}},
    handler=ndbi_handler,
)

BUFFER_SKILL = Skill(
    name="buffer-analysis",
    description="Create a spatial buffer around a GeoJSON geometry.",
    input_schema={
        "type": "object", "required": ["geometry"],
        "properties": {"geometry": {"type": "object"}, "distance": {"type": "number"}},
    },
    output_schema={"type": "object", "properties": {"buffered_geometry": {"type": "string"}, "path": {"type": "string"}}},
    handler=buffer_handler,
)

ZONAL_STATS_SKILL = Skill(
    name="zonal-stats",
    description="Compute zonal stats (mean/sum/min/max) for raster by vector zones.",
    input_schema={
        "type": "object", "required": ["raster", "zones"],
        "properties": {"raster": {"type": "string"}, "zones": {"type": "object"}},
    },
    output_schema={"type": "object", "properties": {"zones": {"type": "array"}, "zone_count": {"type": "integer"}}},
    handler=zonal_stats_handler,
)

REPROJECT_SKILL = Skill(
    name="reproject",
    description="Reproject a raster to a target CRS.",
    input_schema={
        "type": "object", "required": ["raster", "target_crs"],
        "properties": {"raster": {"type": "string"}, "target_crs": {"type": "string"}},
    },
    output_schema={"type": "object", "properties": {"reprojected_raster": {"type": "string"}, "target_crs": {"type": "string"}}},
    handler=reproject_handler,
)

CLIP_SKILL = Skill(
    name="clip-crop",
    description="Clip a raster by geometry or bounding box.",
    input_schema={
        "type": "object", "required": ["raster"],
        "properties": {"raster": {"type": "string"}, "bbox": {"type": "array"}, "geometry": {"type": "object"}, "output": {"type": "string"}},
    },
    output_schema={"type": "object", "properties": {"clipped_raster": {"type": "string"}, "stats": {"type": "object"}}},
    handler=clip_handler,
)

COMPOSITE_SKILL = Skill(
    name="composite-bands",
    description="Stack multiple single-band rasters into one multiband GeoTIFF.",
    input_schema={
        "type": "object", "required": ["bands"],
        "properties": {"bands": {"type": "array", "items": {"type": "string"}}, "output": {"type": "string"}},
    },
    output_schema={"type": "object", "properties": {"composite_raster": {"type": "string"}, "bands": {"type": "integer"}}},
    handler=composite_handler,
)

# ── 内建技能列表（12 个） ──

BUILTIN_SKILLS = [
    NDVI_SKILL, CHANGE_DETECTION_SKILL,
    TERRAIN_SLOPE_SKILL, TERRAIN_ASPECT_SKILL,
    NDWI_SKILL, EVI_SKILL, NDBI_SKILL,
    BUFFER_SKILL, ZONAL_STATS_SKILL,
    REPROJECT_SKILL, CLIP_SKILL, COMPOSITE_SKILL,
]