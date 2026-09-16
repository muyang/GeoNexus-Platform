"""Test the 8 new P0 GeoSkills (extended_handlers)."""

from pathlib import Path

import numpy as np
import rasterio
from geonexus.geonode.skill import SkillContext
from rasterio.transform import from_bounds

from geonexus_execution_plane.extended_handlers import (
    buffer_handler,
    clip_handler,
    composite_handler,
    evi_handler,
    ndbi_handler,
    ndwi_handler,
    reproject_handler,
    zonal_stats_handler,
)


def _make_band(path, base_val=0.5, noise=0.05, w=32, h=24):
    rng = np.random.default_rng(7)
    data = np.clip(np.full((h, w), base_val, np.float32) + rng.normal(0, noise, (h, w)).astype(np.float32), 0.01, 1.0)
    with rasterio.open(path, "w", driver="GTiff", dtype=rasterio.float32, count=1,
                       width=w, height=h, crs="EPSG:4326",
                       transform=from_bounds(-10, -5, 10, 5, w, h)) as dst:
        dst.write(data, 1)
    return path


def ctx(tmp_path):
    return SkillContext(workdir=str(tmp_path))


class TestNDWI:
    def test_ndwi_water(self, tmp_path):
        g = _make_band(str(tmp_path / "green.tif"), 0.6, 0.02)
        n = _make_band(str(tmp_path / "nir.tif"), 0.1, 0.02)
        r = ndwi_handler({"green": g, "nir": n}, ctx(tmp_path))
        # NDWI = (0.6-0.1)/(0.6+0.1) ≈ 0.714
        assert abs(r["stats"]["mean"] - 0.71) < 0.08
        assert r["stats"]["max"] > 0


class TestEVI:
    def test_evi_vegetation(self, tmp_path):
        r = _make_band(str(tmp_path / "red.tif"), 0.1, 0.02)
        n = _make_band(str(tmp_path / "nir.tif"), 0.7, 0.02)
        b = _make_band(str(tmp_path / "blue.tif"), 0.05, 0.02)
        result = evi_handler({"red": r, "nir": n, "blue": b}, ctx(tmp_path))
        assert result["stats"]["mean"] > 0.4


class TestNDBI:
    def test_ndbi_builtup(self, tmp_path):
        s = _make_band(str(tmp_path / "swir.tif"), 0.5, 0.02)
        n = _make_band(str(tmp_path / "nir.tif"), 0.3, 0.02)
        r = ndbi_handler({"swir": s, "nir": n}, ctx(tmp_path))
        assert abs(r["stats"]["mean"] - 0.25) < 0.1


class TestBuffer:
    def test_buffer_point(self, tmp_path):
        geom = {"type": "Point", "coordinates": [100.0, 4.0]}
        r = buffer_handler({"geometry": geom, "distance": 5000}, ctx(tmp_path))
        assert "Polygon" in r["buffered_geometry"]


class TestZonalStats:
    def test_zonal_stats(self, tmp_path):
        raster = _make_band(str(tmp_path / "dem.tif"), 0.5, 0.05)
        zones = {
            "type": "FeatureCollection",
            "features": [
                {"type": "Feature", "geometry": {"type": "Polygon", "coordinates": [[[-5, -2], [5, -2], [5, 2], [-5, 2], [-5, -2]]]}, "properties": {"name": "zone-a"}},
            ],
        }
        r = zonal_stats_handler({"raster": raster, "zones": zones}, ctx(tmp_path))
        assert r["zone_count"] == 1
        assert r["zones"][0]["pixels"] > 0


class TestReproject:
    def test_reproject_epsg(self, tmp_path):
        r = _make_band(str(tmp_path / "src.tif"), 0.5, 0.02)
        result = reproject_handler({"raster": r, "target_crs": "EPSG:3857"}, ctx(tmp_path))
        assert "3857" in result["target_crs"]
        assert Path(result["reprojected_raster"]).exists()


class TestClip:
    def test_clip_bbox(self, tmp_path):
        r = _make_band(str(tmp_path / "big.tif"), 0.5, 0.02)
        result = clip_handler({"raster": r, "bbox": [-5, -2, 5, 2]}, ctx(tmp_path))
        assert Path(result["clipped_raster"]).exists()
        with rasterio.open(result["clipped_raster"]) as src:
            assert src.width <= 32
            assert src.height <= 24


class TestComposite:
    def test_composite_two_bands(self, tmp_path):
        a = _make_band(str(tmp_path / "a.tif"), 0.3, 0.02)
        b = _make_band(str(tmp_path / "b.tif"), 0.7, 0.02)
        result = composite_handler({"bands": [a, b]}, ctx(tmp_path))
        assert result["bands"] == 2
        with rasterio.open(result["composite_raster"]) as src:
            assert src.count == 2