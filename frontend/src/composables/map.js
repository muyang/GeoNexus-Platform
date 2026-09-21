import { ref, shallowRef } from 'vue'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { getBasemap, DEFAULT_BASEMAP } from './basemaps'

/** 单例地图状态：EarthLayout 建图，任意页面通过 useMap() 驱动图层与视野。 */
const map = shallowRef(null)
const ready = ref(false)
const basemapFailed = ref(false)
const loading = ref(false)
const error = ref('')
const tilestats = ref({ errors: 0, lastError: '' })
const basemapId = ref(DEFAULT_BASEMAP)
let loadTimer = null
const BASEMAP_TIMEOUT_MS = 8000
const layers = ref([])          // [{ id, title, kind, visible, opacity, bbox }]

const EMPTY_STYLE = {
  version: 8,
  sources: {},
  layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#04060d' } }]
}

export function useMap() {
  function mount(container, styleUrl, id = DEFAULT_BASEMAP) {
    basemapId.value = id
    if (!container) return map.value
    // 无 WebGL 时不要静默黑屏：明确告知，且目录/图层列表照常可用
    if (typeof maplibregl.supported === 'function' && !maplibregl.supported()) {
      basemapFailed.value = true
      loading.value = false
      error.value = '当前浏览器或环境不支持 WebGL，地图底图无法渲染（右侧图层与目录仍可用）'
      return null
    }
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
    // 诊断句柄：排障脚本与浏览器控制台可直接查看地图内部状态（只读，勿依赖）
    if (typeof window !== 'undefined') window.__gnxMap = map.value
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
    // 瓦片/源级错误单独计数：矢量底图偶发缺瓦片不应整体判死，只有源不可用才切兜底
    map.value.on('error', (e) => {
      const msg = e?.error?.message || '底图错误'
      tilestats.value = { errors: tilestats.value.errors + 1, lastError: msg }
      const fatal = /style|sprite|glyphs|source|Failed to fetch|NetworkError|AbortError/i.test(msg) && !ready.value
      error.value = msg
      if (fatal && !basemapFailed.value) {
        basemapFailed.value = true
        try { map.value.setStyle(EMPTY_STYLE) } catch { /* 忽略 */ }
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

  /** 缩放到全部图层：即使底图空白，用户也能立刻看到数据落在哪里。 */
  function fitAll() {
    const boxes = layers.value.map((l) => l.bbox).filter((b) => Array.isArray(b) && b.length === 4)
    if (!boxes.length) return
    const merged = boxes.reduce((acc, b) => [
      Math.min(acc[0], b[0]), Math.min(acc[1], b[1]), Math.max(acc[2], b[2]), Math.max(acc[3], b[3])
    ], boxes[0])
    fit(merged)
  }

  function fit(bbox) {
    const m = map.value
    if (!m || !Array.isArray(bbox) || bbox.length !== 4) return
    m.fitBounds(bboxToCoords(bbox), { padding: 80, duration: 600 })
  }

  function colorFor(kind) {
    return ({ data: '#57d7ff', skill: '#3ce6b0', model: '#b48bff', knowledge: '#ffc65c', agent: '#ff7a90' })[kind] || '#8fd3ff'
  }

  /** 切换底图：只换 style，不重建地图，也不影响 GeoCard 图层。 */
  function setBasemap(id) {
    const bm = getBasemap(id)
    basemapId.value = bm.id
    const m = map.value
    if (!m) return
    ready.value = false; loading.value = true; basemapFailed.value = false; error.value = ''
    tilestats.value = { errors: 0, lastError: '' }
    try { m.setStyle(bm.style) } catch (e) { error.value = e.message }
    if (loadTimer) clearTimeout(loadTimer)
    loadTimer = setTimeout(() => {
      if (ready.value) return
      loading.value = false; basemapFailed.value = true
      error.value = `${bm.label} 底图 ${BASEMAP_TIMEOUT_MS / 1000}s 内未就绪`
      try { map.value?.setStyle(EMPTY_STYLE) } catch { /* 忽略 */ }
    }, BASEMAP_TIMEOUT_MS)
  }

  function destroy() {
    if (loadTimer) { clearTimeout(loadTimer); loadTimer = null }
    if (map.value) { try { map.value.remove() } catch { /* 忽略 */ } }
    map.value = null; ready.value = false; loading.value = false; layers.value = []
  }

  return { map, ready, loading, basemapFailed, error, tilestats, basemapId, layers, mount, destroy, setBasemap, syncLayers, setVisible, setOpacity, fit, fitAll, colorFor }
}
