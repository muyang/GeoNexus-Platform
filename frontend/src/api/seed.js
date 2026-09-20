/** 离线兜底数据：后端/节点不在线时页面仍可演示（明确标注"离线演示数据"，不冒充实时）。 */
export const seedGeoCards = [
  { id: 's2-ndvi-2015', type: 'data', title: 'Sentinel-2 NDVI 2015 · 亚马逊', provider: 'Planetary Computer', ref: 's3://pc/landsat/2015', owner: 'data-node-a', visibility: 'public', bbox: [-73.9, -15.0, -44.0, 5.0] },
  { id: 's2-ndvi-2025', type: 'data', title: 'Sentinel-2 NDVI 2025 · 亚马逊', provider: 'Planetary Computer', ref: 's3://pc/landsat/2025', owner: 'data-node-a', visibility: 'public', bbox: [-73.9, -15.0, -44.0, 5.0] },
  { id: 'dem-srtm-v3', type: 'data', title: 'SRTM DEM v3 · 全球', provider: 'USGS', ref: 's3://usgs/srtm/v3', owner: 'data-node-b', visibility: 'public', bbox: [-180, -60, 180, 60] },
  { id: 'ndvi-change', type: 'skill', title: 'NDVI 变化检测', provider: 'GeoNexus SDK', ref: 'skill://ndvi-change', owner: 'compute-node', visibility: 'public' },
  { id: 'terrain-slope', type: 'skill', title: '地形坡度', provider: 'OGE', ref: 'oge://Coverage.terrSlope', owner: 'oge-node', visibility: 'public' },
  { id: 'mogan-geokg', type: 'knowledge', title: '莫干地理知识图谱', provider: 'GeoKG', ref: 'geokg://dataset/2026.09.1', owner: 'geokg', visibility: 'public' }
]

export const seedCases = [
  { id: 'case-ndvi-amazon', title: '亚马逊雨林植被变化（2015 → 2025）', question: '十年间植被覆盖如何变化？', aoi: 'Amazon Basin', data: ['s2-ndvi-2015', 's2-ndvi-2025'], provenance: 'live', outputs: ['ndvi_change.tif', 'stats.json'] },
  { id: 'case-terrain-slope', title: '区域地形坡度提取', question: '坡度分布与可通行性？', aoi: 'Mekong Delta', data: ['dem-srtm-v3'], provenance: 'archival', outputs: ['slope.tif'] }
]

export const seedFlows = [
  { id: 'flow-1', title: 'NDVI 双时相对比', status: 'succeeded', steps: 3, lastRun: '2026-09-20T10:00:00Z' },
  { id: 'flow-2', title: '地形分析', status: 'draft', steps: 2, lastRun: null }
]

export const seedKnowledge = {
  dataset: '2026.09.1',
  nodes: [
    { id: 'country.BRA', label: 'Brazil', level: 'country' },
    { id: 'place.Amazon', label: 'Amazon Basin', level: 'place' },
    { id: 'sdg.15', label: 'SDG 15 陆地生命', level: 'sdg' }
  ],
  edges: [
    { source: 'country.BRA', target: 'place.Amazon', relation: 'CONTAINS' },
    { source: 'place.Amazon', target: 'sdg.15', relation: 'SUPPORTS' }
  ]
}
