import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { getBasemap } from '../basemaps'
import { PC1_BANDS, WATER_CLASS_STYLE } from '../caseStyle'

/** MapLibre 后端（矢量/栅格底图 + 2D 地图）。
 *  状态由 facade 注入，本模块不持有全局单例 —— 这样引擎可以在运行时切换。 */
export function createMaplibreEngine(state, hooks = {}) {
  const { map, ready, loading, basemapFailed, slowBasemap, error, tilestats, basemapId, layers } = state
  let loadTimer = null
  let featureClick = null
  let retried = false
  const TIMEOUT_MS = 8000

  const EMPTY_STYLE = {
    version: 8,
    sources: {},
    layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#04060d' } }]
  }

  const colorFor = (kind) => ({
    data: '#57d7ff', skill: '#3ce6b0', model: '#b48bff', knowledge: '#ffc65c', agent: '#ff7a90',
    workflow: '#7fe3ff', compute: '#9aa7c7'
  })[kind] || '#8fd3ff'

  const bboxRing = (bbox) => [[bbox[0], bbox[1]], [bbox[2], bbox[1]], [bbox[2], bbox[3]], [bbox[0], bbox[3]], [bbox[0], bbox[1]]]

  function clearTimer() { if (loadTimer) { clearTimeout(loadTimer); loadTimer = null } }

  function markReady(why) {
    if (ready.value) return
    ready.value = true; loading.value = false; basemapFailed.value = false; slowBasemap.value = false
    clearTimer()
    if (import.meta.env.DEV) console.debug(`[maplibre] 底图就绪（${why}）`)
  }

  function armTimer(label) {
    clearTimer()
    loadTimer = setTimeout(() => {
      if (ready.value) return
      // 超时只提示"慢"，**不**把样式换成空样式（破坏性且不会恢复），并自动重试一次
      loading.value = false
      slowBasemap.value = true
      error.value = `${label} 底图 ${TIMEOUT_MS / 1000}s 内未就绪（网络较慢或瓦片服务不可达）`
      retryOnce()
    }, TIMEOUT_MS)
  }

  function retryOnce() {
    const m = map.value
    if (!m || retried) return
    retried = true
    try { m.setStyle(getBasemap(basemapId.value).style) } catch { /* 交给用户手动重试 */ }
  }

  function retryBasemap() { retried = false; setBasemap(basemapId.value) }

  function mount(container, { basemap = 'dark-vector' } = {}) {
    if (!container) return false
    if (map.value && !map.value.getContainer()?.isConnected) { destroy() }
    if (map.value) return true
    if (typeof maplibregl.supported === 'function' && !maplibregl.supported()) {
      basemapFailed.value = true; loading.value = false
      error.value = '当前浏览器或环境不支持 WebGL，地图无法渲染（右侧图层与目录仍可用）'
      return false
    }
    basemapId.value = basemap
    const bm = getBasemap(basemap)
    map.value = new maplibregl.Map({
      container, style: bm.style, center: [110, 30], zoom: 2.2, attributionControl: { compact: true }
    })
    if (typeof window !== 'undefined') window.__gnxMap = map.value   // 排障句柄（只读）
    map.value.on('load', () => markReady('load'))
    map.value.on('style.load', () => markReady('style.load'))        // setStyle 后只会有这个
    map.value.on('idle', () => markReady('idle'))
    map.value.on('error', (e) => {
      const msg = e?.error?.message || '底图错误'
      tilestats.value = { errors: tilestats.value.errors + 1, lastError: msg }
      error.value = msg
      if (/style|sprite|glyphs/i.test(msg) && !ready.value) { slowBasemap.value = true; retryOnce() }
    })
    loading.value = true
    armTimer(bm.label)
    map.value.once('idle', () => redraw())     // 补画可能在 mount 之前就到达的图层
    return true
  }

  function setBasemap(id) {
    const bm = getBasemap(id)
    basemapId.value = bm.id
    const m = map.value
    if (!m) return
    ready.value = false; loading.value = true; basemapFailed.value = false; slowBasemap.value = false
    retried = false; error.value = ''; tilestats.value = { errors: 0, lastError: '' }
    try { m.setStyle(bm.style) } catch (e) { error.value = e.message }
    armTimer(bm.label)
  }

  function syncLayers(cards) {
    layers.value = (cards || [])
      .filter((c) => Array.isArray(c.bbox) && c.bbox.length === 4)
      .map((c) => ({ id: c.id, title: c.title || c.id, kind: c.type || 'data', bbox: c.bbox, visible: true, opacity: 0.35 }))
    redraw()
  }

  /** 按 state.layers 补齐图层（mount 是异步的：数据可能先到）。 */
  function redraw() {
    const m = map.value
    if (!m) return
    const draw = () => {
      for (const l of layers.value) {
        const srcId = `src-${l.id}`; const layerId = `lyr-${l.id}`
        if (m.getSource(srcId)) continue
        m.addSource(srcId, { type: 'geojson', data: { type: 'Feature', geometry: { type: 'Polygon', coordinates: [bboxRing(l.bbox)] }, properties: {} } })
        m.addLayer({ id: layerId, type: 'fill', source: srcId,
          paint: { 'fill-color': colorFor(l.kind), 'fill-opacity': l.opacity, 'fill-outline-color': colorFor(l.kind) } })
      }
      document.documentElement.dataset.mapLayers = String(layers.value.length)
    }
    if (m.isStyleLoaded()) draw(); else m.once('idle', draw)
  }

  /** 案例叠加层：AOI（L1）+ 组成项范围 + 血缘弧线（默认关）。 */
  /** 把 GeoJSON 画上地图：面按 class 配色，点按 PC1 分级（MapLibre 直接用 geojson source）。 */
  function drawCaseGeometry(overlay) {
    const mp = map.value
    if (!mp) return
    const geometry = (overlay && overlay.geometry) || {}
    const visible = (overlay && overlay.visible) || {}
    const ids = ['water_change', 'water_baseline', 'sites']
    for (const name of ids) {
      if (mp.getLayer('lyr-case-' + name)) mp.removeLayer('lyr-case-' + name)
      if (mp.getSource('src-case-' + name)) mp.removeSource('src-case-' + name)
      if (!geometry[name] || visible[name] === false) continue
      mp.addSource('src-case-' + name, { type: 'geojson', data: geometry[name] })
      if (name === 'sites') {
        mp.addLayer({ id: 'lyr-case-sites', type: 'circle', source: 'src-case-sites', paint: {
          'circle-radius': ['match', ['get', 'pc1_band'], 'high', PC1_BANDS.high.radius,
            'medium', PC1_BANDS.medium.radius, PC1_BANDS.low.radius],
          'circle-color': ['match', ['get', 'pc1_band'], 'high', PC1_BANDS.high.color,
            'medium', PC1_BANDS.medium.color, PC1_BANDS.low.color],
          'circle-stroke-color': '#ffffff', 'circle-stroke-width': 1.2,
          'circle-opacity': 0.95
        } })
      } else {
        mp.addLayer({ id: 'lyr-case-' + name, type: 'fill', source: 'src-case-' + name, paint: {
          'fill-color': ['match', ['get', 'class'], 'loss', WATER_CLASS_STYLE.loss.color,
            'gain', WATER_CLASS_STYLE.gain.color, WATER_CLASS_STYLE.stable.color],
          'fill-opacity': name === 'water_baseline' ? 0 : WATER_CLASS_STYLE.loss.opacity,
          'fill-outline-color': WATER_CLASS_STYLE.stable.color
        } })
      }
    }
    document.documentElement.dataset.caseGeometry = String(
      ids.filter((name) => mp.getLayer('lyr-case-' + name)).length)
  }
  function syncCaseOverlay(overlay, { provenance = false, onFeatureClick = null } = {}) {
    if (onFeatureClick) featureClick = onFeatureClick
    bindCaseClicks()
    const mp = map.value
    if (!mp) return
    const draw = () => {
      for (const id of ['case-aoi', 'case-components', 'case-arcs']) {
        if (mp.getLayer(`lyr-${id}`)) mp.removeLayer(`lyr-${id}`)
        if (mp.getSource(`src-${id}`)) mp.removeSource(`src-${id}`)
      }
      if (!overlay) { document.documentElement.dataset.caseOverlay = '0'; return }
      let drawn = 0
      if (Array.isArray(overlay.aoi) && overlay.aoi.length === 4) {
        mp.addSource('src-case-aoi', { type: 'geojson', data: { type: 'Feature',
          geometry: { type: 'Polygon', coordinates: [bboxRing(overlay.aoi)] }, properties: {} } })
        mp.addLayer({ id: 'lyr-case-aoi', type: 'fill', source: 'src-case-aoi',
          paint: { 'fill-color': '#57d7ff', 'fill-opacity': 0.18, 'fill-outline-color': '#8fe6ff' } })
        drawn += 1
      }
      const boxes = (overlay.components || []).filter((c) => Array.isArray(c.bbox) && c.bbox.length === 4)
      if (boxes.length) {
        mp.addSource('src-case-components', { type: 'geojson', data: { type: 'FeatureCollection',
          features: boxes.map((c) => ({ type: 'Feature', properties: { role: c.role },
            geometry: { type: 'Polygon', coordinates: [bboxRing(c.bbox)] } })) } })
        mp.addLayer({ id: 'lyr-case-components', type: 'line', source: 'src-case-components',
          paint: { 'line-color': '#ffc65c', 'line-width': 1 } })
        drawn += boxes.length
      }
      if (provenance && Array.isArray(overlay.aoi)) {
        const centre = [(overlay.aoi[0] + overlay.aoi[2]) / 2, (overlay.aoi[1] + overlay.aoi[3]) / 2]
        mp.addSource('src-case-arcs', { type: 'geojson', data: { type: 'FeatureCollection',
          features: boxes.map((c) => ({ type: 'Feature', properties: { role: c.role },
            geometry: { type: 'LineString', coordinates: [
              [(c.bbox[0] + c.bbox[2]) / 2, (c.bbox[1] + c.bbox[3]) / 2], centre] } })) } })
        mp.addLayer({ id: 'lyr-case-arcs', type: 'line', source: 'src-case-arcs',
          paint: { 'line-color': '#8fe6ff', 'line-width': 1.2, 'line-dasharray': [3, 2] } })
      }
      document.documentElement.dataset.caseOverlay = String(drawn)
      drawCaseGeometry(overlay)
    }
    if (mp.isStyleLoaded()) draw(); else mp.once('idle', draw)
  }

  function clearCaseOverlay() { syncCaseOverlay(null) }

  /** 点击地点 → 面板：只把带 pc1 的要素交上去。挂一次就够了。 */
  function bindCaseClicks() {
    const mp = map.value
    if (!mp || mp.__gnxCaseClick) return
    mp.__gnxCaseClick = true
    mp.on('click', (event) => {
      const layers = ['lyr-case-sites', 'lyr-case-water_change'].filter((id) => mp.getLayer(id))
      if (!layers.length) return
      const hits = mp.queryRenderedFeatures(event.point, { layers })
      if (hits.length && featureClick) featureClick(hits[0].properties)
    })
  }

  function setVisible(id, visible) {
    const l = layers.value.find((x) => x.id === id); if (!l) return
    l.visible = visible
    const m = map.value
    if (m?.getLayer(`lyr-${id}`)) m.setLayoutProperty(`lyr-${id}`, 'visibility', visible ? 'visible' : 'none')
  }

  function setOpacity(id, opacity) {
    const l = layers.value.find((x) => x.id === id); if (!l) return
    l.opacity = opacity
    const m = map.value
    if (m?.getLayer(`lyr-${id}`)) m.setPaintProperty(`lyr-${id}`, 'fill-opacity', opacity)
  }

  function fit(bbox) {
    const m = map.value
    if (!m || !Array.isArray(bbox) || bbox.length !== 4) return
    m.fitBounds([[bbox[0], bbox[1]], [bbox[2], bbox[3]]], { padding: 80, duration: 600 })
  }

  function fitAll() {
    const boxes = layers.value.map((l) => l.bbox).filter((b) => Array.isArray(b) && b.length === 4)
    if (!boxes.length) return
    const merged = boxes.reduce((a, b) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])], boxes[0])
    fit(merged)
  }

  function destroy() {
    clearTimer()
    if (map.value) { try { map.value.remove() } catch { /* 忽略 */ } }
    map.value = null; ready.value = false; loading.value = false; slowBasemap.value = false
    if (typeof window !== 'undefined') delete window.__gnxMap
  }

  return { mount, destroy, syncLayers, syncCaseOverlay, clearCaseOverlay, redraw, setVisible, setOpacity, fit, fitAll, setBasemap, retryBasemap, colorFor, setProjection: () => {} }
}
