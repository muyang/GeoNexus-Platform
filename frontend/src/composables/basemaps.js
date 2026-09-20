/** 底图注册表：矢量优先，栅格兜底。
 *
 *  为什么两套：矢量瓦片依赖 WebGL 与瓦片服务可达性；栅格瓦片在弱环境/无 WebGL2 时更稳，
 *  并且所有候选源都实测可达（见 docs/ 里的前端说明）。切换不改图层，只换底图。
 */

const carto = (name) => `https://basemaps.cartocdn.com/${name}/{z}/{x}/{y}.png`;

/** 栅格样式直接用内联 style 对象，避免再依赖第三方 style.json。 */
function rasterStyle({ tiles, attribution, maxzoom = 19 }) {
  return {
    version: 8,
    sources: { base: { type: 'raster', tiles: [tiles], tileSize: 256, attribution, maxzoom } },
    layers: [{ id: 'base', type: 'raster', source: 'base' }]
  };
}

export const BASEMAPS = [
  {
    id: 'dark-vector', label: '深色矢量', raster: false,
    style: import.meta.env.VITE_BASEMAP_DARK || 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'
  },
  {
    id: 'dark-raster', label: '深色栅格', raster: true,
    style: rasterStyle({ tiles: carto('dark_all'), attribution: '© OpenStreetMap © CARTO' })
  },
  {
    id: 'satellite', label: '卫星影像', raster: true,
    style: rasterStyle({
      tiles: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      attribution: '© Esri, Maxar, Earthstar Geographics'
    })
  },
  {
    id: 'light-vector', label: '浅色矢量', raster: false,
    style: import.meta.env.VITE_BASEMAP_LIGHT || 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json'
  }
];

export const DEFAULT_BASEMAP = 'dark-vector';

export function getBasemap(id) {
  return BASEMAPS.find((b) => b.id === id) || BASEMAPS.find((b) => b.id === DEFAULT_BASEMAP);
}
