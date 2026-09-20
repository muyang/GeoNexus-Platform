import { ref, shallowRef } from 'vue'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

/** 单例地图状态：EarthLayout 建图，任意页面通过 useMap() 驱动图层与视野。 */
const map = shallowRef(null)
const ready = ref(false)
const basemapFailed = ref(false)
const loading = ref(false)
const error = ref('')
let loadTimer = null
const BASEMAP_TIMEOUT_MS = 8000
const layers = ref([])          // [{ id, title, kind, visible, opacity, bbox }]

const EMPTY_STYLE = {
  version: 8,
  sources: {},
  layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#04060d' } }]
}

export function useMap() {
  function mount(container, styleUrl) {
    if (!container) return map.value
    // 门户↔地球系统切换会换掉容器：旧实例挂在一个已卸载的 DOM 上，必须销毁重建
    if (map.value && !map.value.getContainer()?.isConnected) {
      try { map.value.remove() } catch { /* 已不可用 */ }
      map.value = null; ready.value = false; layers.value = []
    }
    if (map.value) return map.value
    map.value = new maplibregl.Map({
      container,
      style: styleUrl,
      center: [110, 30],
      zoom: 2.2,
      attributionControl: { compact: true }
    })
    loading.value = true
    map.value.on('load', () => {
      ready.value = true; loading.value = false; basemapFailed.value = false
      if (loadTimer) { clearTimeout(loadTimer); loadTimer = null }
    })
    // 弱网/离线：底图不能在限时内就绪时给出明确提示，并切到本地空样式，
    // 让 GeoCard 图层继续可见 —— 而不是让用户盯着一块黑屏。
    if (loadTimer) clearTimeout(loadTimer)
    loadTimer = setTimeout(() => {
      if (ready.value) return
      loading.value = false; basemapFailed.value = true
      error.value = `底图 ${BASEMAP_TIMEOUT_MS / 1000}s 内未加载完成（网络或瓦片服务不可达）`
      try { map.value?.setStyle(EMPTY_STYLE) } catch { /* 忽略 */ }
    }, BASEMAP_TIMEOUT_MS)
    // 在线底图不可用时降级到本地空样式：地图仍可承载 GeoCard 图层，并明确提示
    map.value.on('error', (e) => {
      error.value = e?.error?.message || '底图加载失败'
      if (!basemapFailed.value) {
        basemapFailed.value = true
        try { map.value.setStyle(EMPTY_STYLE) } catch { /* 已经不可用则忽略 */ }
      }
    })
    return map.value
  }

  function bboxToCoords(bbox) {
    return [[bbox[0], bbox[1]], [bbox[2], bbox[3]]]
  }

  /** 用 GeoCard 的 bbox 画覆盖框：这是"目录 → 地图"的最短闭环。 */
  function syncLayers(cards) {
    const m = map.value
    layers.value = (cards || [])
      .filter((c) => Array.isArray(c.bbox) && c.bbox.length === 4)
      .map((c) => ({ id: c.id, title: c.title || c.id, kind: c.type || 'data', bbox: c.bbox, visible: true, opacity: 0.35 }))
    if (!m) return
    const draw = () => {
      for (const l of layers.value) {
        const srcId = `src-${l.id}`; const layerId = `lyr-${l.id}`
        if (!m.getSource(srcId)) {
          m.addSource(srcId, { type: 'geojson', data: { type: 'Feature', geometry: { type: 'Polygon', coordinates: [bboxToCoords(l.bbox).concat([bboxToCoords(l.bbox)[0]])] }, properties: {} } })
          m.addLayer({ id: layerId, type: 'fill', source: srcId,
            paint: { 'fill-color': colorFor(l.kind), 'fill-opacity': l.opacity, 'fill-outline-color': colorFor(l.kind) } })
        }
      }
    }
    if (m.isStyleLoaded()) draw(); else m.once('idle', draw)
    // 诊断信号：DOM 上可断言"图层真的加进去了"，不依赖截图（headless 不合成 WebGL）
    document.documentElement.dataset.mapLayers = String(layers.value.length)
  }

  function setVisible(id, visible) {
    const l = layers.value.find((x) => x.id === id); if (!l) return
    l.visible = visible
    const m = map.value
    if (m && m.getLayer(`lyr-${id}`)) m.setLayoutProperty(`lyr-${id}`, 'visibility', visible ? 'visible' : 'none')
  }

  function setOpacity(id, opacity) {
    const l = layers.value.find((x) => x.id === id); if (!l) return
    l.opacity = opacity
    const m = map.value
    if (m && m.getLayer(`lyr-${id}`)) m.setPaintProperty(`lyr-${id}`, 'fill-opacity', opacity)
  }

  function fit(bbox) {
    const m = map.value
    if (!m || !Array.isArray(bbox) || bbox.length !== 4) return
    m.fitBounds(bboxToCoords(bbox), { padding: 80, duration: 600 })
  }

  function colorFor(kind) {
    return ({ data: '#57d7ff', skill: '#3ce6b0', model: '#b48bff', knowledge: '#ffc65c', agent: '#ff7a90' })[kind] || '#8fd3ff'
  }

  function destroy() {
    if (loadTimer) { clearTimeout(loadTimer); loadTimer = null }
    if (map.value) { try { map.value.remove() } catch { /* 忽略 */ } }
    map.value = null; ready.value = false; loading.value = false; layers.value = []
  }

  return { map, ready, loading, basemapFailed, error, layers, mount, destroy, syncLayers, setVisible, setOpacity, fit, colorFor }
}
