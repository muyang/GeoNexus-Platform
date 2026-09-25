import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { getBasemap } from '../basemaps'
import { SIZE_BANDS, SIZE_BAND_ORDER, UNKNOWN_WETLAND, WETLAND_STYLE } from '../caseStyle'

/** MapLibre 后端（矢量/栅格底图 + 2D 地图）。
 *  状态由 facade 注入，本模块不持有全局单例 —— 这样引擎可以在运行时切换。 */
export function createMaplibreEngine(state, hooks = {}) {
  const { map, ready, loading, basemapFailed, slowBasemap, error, tilestats, basemapId, layers, mountedEngine } = state
  let loadTimer = null
  let featureClick = null
  let pendingOverlay = null
  let pendingProvenance = false
  let drawQueued = false
  let pendingFit = null
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
    if (pendingOverlay) syncCaseOverlay(pendingOverlay)
    if (pendingFit) fit(pendingFit)
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
    mountedEngine.value = 'maplibre'
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
  /** 把 GeoJSON 画上地图：**颜色 = 湿地类型、大小 = PC1 分档**（MapLibre 直接用 geojson source）。
   *  筛选条件取自 `overlay.siteFilter`，与面板列表同一套 —— 两边不一致等于给出两个答案。
   *  物种视图：几何表达式按 `sp` 数组筛站点，并按 `sp10` / `sp50` 叠两层金色圆环
   *  （一圈 = 超过该物种种群 10%，两圈 = 超过 50%）。**圆的大小不变**：
   *  比例原文没公布，用大小表达比例就是编数据。 */
  function drawCaseGeometry(overlay) {
    const mp = map.value
    if (!mp) return
    const geometry = (overlay && overlay.geometry) || {}
    const visible = (overlay && overlay.visible) || {}
    const filter = (overlay && overlay.siteFilter) || {}
    const types = Array.isArray(filter.types) ? filter.types : ['coastal', 'inland']
    // 只有沿海/内陆两类受开关控制；未标注类型的点跟着"至少开一类"走
    const typeFilter = ['any', ['in', ['get', 'wetland_type'], ['literal', types]],
      ['!', ['in', ['get', 'wetland_type'], ['literal', ['coastal', 'inland']]]]]
    const expression = ['all', typeFilter]
    if (filter.unprotectedOnly) expression.push(['!=', ['get', 'protected'], true])
    const species = filter.species === null || filter.species === undefined ? null : Number(filter.species)
    if (species !== null) expression.push(['in', species, ['get', 'sp']])
    const ids = ['sites']
    const ringLayerIds = ['case-sites-ring5', 'case-sites-ring10']
    for (const id of ringLayerIds) if (mp.getLayer('lyr-' + id)) mp.removeLayer('lyr-' + id)
    for (const name of ids) {
      if (mp.getLayer('lyr-case-' + name)) mp.removeLayer('lyr-case-' + name)
      if (mp.getSource('src-case-' + name)) mp.removeSource('src-case-' + name)
      if (!geometry[name] || visible[name] === false) continue
      mp.addSource('src-case-' + name, { type: 'geojson', data: geometry[name] })
      const colorMatch = ['match', ['get', 'wetland_type'],
        'coastal', WETLAND_STYLE.coastal.color,
        'inland', WETLAND_STYLE.inland.color,
        UNKNOWN_WETLAND.color]
      const radiusMatch = ['match', ['get', 'pc1_band'],
        ...SIZE_BAND_ORDER.flatMap((key) => [key, SIZE_BANDS[key].radius]),
        SIZE_BANDS.xs.radius]
      mp.addLayer({ id: 'lyr-case-' + name, type: 'circle', source: 'src-case-' + name,
        filter: expression, paint: {
          'circle-radius': radiusMatch,
          'circle-color': colorMatch,
          'circle-stroke-color': '#ffffff', 'circle-stroke-width': 1.2,
          'circle-opacity': 0.95
        } })
      // 金环：与 3D 地球同一套含义（一圈 = >10%，两圈 = >50%）。
      // 原文两列**互斥**（没有一行同时为 True），所以内圈的判据是"sp10 或 sp50" ——
      // 只按 sp10 筛的话，>50% 的站点会少画内圈，看起来就像只超过 10%。
      if (species !== null) {
        const ringFilters = [
          [5, ['any', ['in', species, ['get', 'sp10']], ['in', species, ['get', 'sp50']]]],
          [10, ['in', species, ['get', 'sp50']]]
        ]
        for (const [offset, ringFilter] of ringFilters) {
          mp.addLayer({ id: `lyr-case-sites-ring${offset}`, type: 'circle', source: 'src-case-' + name,
            // 注意：expression 本身就是 ['all', <条…>]，它的头不能再摊平进来，
            // 否则得到 ['all','all',…] —— 'all' 是字符串而不是表达式，这层根本加不上。
            filter: ['all', ...expression.slice(1), ringFilter], paint: {
              'circle-radius': ['+', radiusMatch, offset],
              'circle-color': 'rgba(0,0,0,0)',
              'circle-stroke-color': '#ffd479', 'circle-stroke-width': 1.6
            } })
        }
      }
    }
    document.documentElement.dataset.caseGeometry = String(
      ids.filter((name) => mp.getLayer('lyr-case-' + name)).length)
    // 排障读数（与 3D 侧同名）：这一遍几何是用哪个物种下标画的
    document.documentElement.dataset.caseSpecies = species === null ? '' : String(species)
    // 与 3D 地球同名的一个读数：CDP 断言"物种筛选在 2D 里也真的画了环"
    document.documentElement.dataset.caseSpeciesRings = String(
      ['lyr-case-sites-ring5', 'lyr-case-sites-ring10'].filter((id) => mp.getLayer(id)).length)
  }
  function syncCaseOverlay(overlay, { provenance = false, onFeatureClick = null } = {}) {
    if (onFeatureClick) featureClick = onFeatureClick
    pendingOverlay = overlay
    pendingProvenance = provenance
    const mp = map.value
    if (!mp) return
    bindCaseClicks()
    // 关键：画的时候**现读** pendingOverlay，而不是闭包里那次调用的 overlay。
    // 早先写成 `const draw = () => {...overlay...}; mp.once('idle', draw)`，
    // 样式还没装好时会把"当时那份"叠加层排进 idle 队列；样式好了以后几个排队的
    // draw 依次触发，**最后跑的那个可能是旧的**（例如物种筛选前的那一份），
    // 于是地图回到旧筛选：面板筛了物种、2D 地图上却看不出筛选（截图复核时抓到的）。
    const drawLatest = () => {
      const current = pendingOverlay
      const showProvenance = pendingProvenance
      for (const id of ['case-aoi', 'case-components', 'case-arcs']) {
        if (mp.getLayer(`lyr-${id}`)) mp.removeLayer(`lyr-${id}`)
        if (mp.getSource(`src-${id}`)) mp.removeSource(`src-${id}`)
      }
      if (!current) { document.documentElement.dataset.caseOverlay = '0'; return }
      let drawn = 0
      if (Array.isArray(current.aoi) && current.aoi.length === 4) {
        mp.addSource('src-case-aoi', { type: 'geojson', data: { type: 'Feature',
          geometry: { type: 'Polygon', coordinates: [bboxRing(current.aoi)] }, properties: {} } })
        mp.addLayer({ id: 'lyr-case-aoi', type: 'fill', source: 'src-case-aoi',
          paint: { 'fill-color': '#57d7ff', 'fill-opacity': 0.18, 'fill-outline-color': '#8fe6ff' } })
        drawn += 1
      }
      const boxes = (current.components || []).filter((c) => Array.isArray(c.bbox) && c.bbox.length === 4)
      if (boxes.length) {
        mp.addSource('src-case-components', { type: 'geojson', data: { type: 'FeatureCollection',
          features: boxes.map((c) => ({ type: 'Feature', properties: { role: c.role },
            geometry: { type: 'Polygon', coordinates: [bboxRing(c.bbox)] } })) } })
        mp.addLayer({ id: 'lyr-case-components', type: 'line', source: 'src-case-components',
          paint: { 'line-color': '#ffc65c', 'line-width': 1 } })
        drawn += boxes.length
      }
      if (showProvenance && Array.isArray(current.aoi)) {
        const centre = [(current.aoi[0] + current.aoi[2]) / 2, (current.aoi[1] + current.aoi[3]) / 2]
        mp.addSource('src-case-arcs', { type: 'geojson', data: { type: 'FeatureCollection',
          features: boxes.map((c) => ({ type: 'Feature', properties: { role: c.role },
            geometry: { type: 'LineString', coordinates: [
              [(c.bbox[0] + c.bbox[2]) / 2, (c.bbox[1] + c.bbox[3]) / 2], centre] } })) } })
        mp.addLayer({ id: 'lyr-case-arcs', type: 'line', source: 'src-case-arcs',
          paint: { 'line-color': '#8fe6ff', 'line-width': 1.2, 'line-dasharray': [3, 2] } })
      }
      document.documentElement.dataset.caseOverlay = String(drawn)
      // 画几何失败不能连累叠加层（AOI/组成项已经画上了）：如实记下错误，
      // 与 Cesium 侧的 `dataset.caseGeometryError` 同名，排障脚本读同一个键。
      try { drawCaseGeometry(current) } catch (e) {
        document.documentElement.dataset.caseGeometryError = String(e && e.message ? e.message : e)
        if (import.meta.env.DEV) console.error('[maplibre] 案例几何绘制失败:', e)
      }
    }
    // 样式没装好时只排一次；排队期间又来新叠加层就沿用同一张排队票（画的还是最新那份）
    if (mp.isStyleLoaded()) { drawQueued = false; drawLatest(); return }
    if (drawQueued) return
    drawQueued = true
    mp.once('idle', () => { drawQueued = false; drawLatest() })
  }

  function clearCaseOverlay() { syncCaseOverlay(null) }

  /** 点击地点 → 面板：只把带 site_id 的要素交上去（点的属性里有地点标识）。挂一次就够了。 */
  function bindCaseClicks() {
    const mp = map.value
    if (!mp || mp.__gnxCaseClick) return
    mp.__gnxCaseClick = true
    mp.on('click', (event) => {
      const layers = ['lyr-case-sites'].filter((id) => mp.getLayer(id))
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
    if (!Array.isArray(bbox) || bbox.length !== 4) return
    if (!m) { pendingFit = bbox; return }
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
    if (mountedEngine.value === 'maplibre') mountedEngine.value = ''
  }

  return { mount, destroy, syncLayers, syncCaseOverlay, clearCaseOverlay, redraw, setVisible, setOpacity, fit, fitAll, setBasemap, retryBasemap, colorFor, setProjection: () => {} }
}
