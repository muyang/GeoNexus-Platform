import { getBasemap } from '../basemaps'

/** Cesium 后端：3D 地球（默认）。
 *
 *  取舍：Cesium 原生不支持矢量瓦片，所以底图用各底图的**栅格**版本；
 *  地形用 EllipsoidTerrainProvider（不依赖 Ion token，开箱可用）；
 *  需要真实地形/影像时再配 CESIUM_ION_TOKEN。
 *  GeoCard 覆盖范围画成地面矩形，与 MapLibre 后端保持同一套图层语义。 */
export function createCesiumEngine(state) {
  const { ready, loading, basemapFailed, slowBasemap, error, tilestats, basemapId, layers } = state
  let viewer = null
  let CesiumMod = null
  const entityByLayer = new Map()
  const TIMEOUT_MS = 12000

  const colorFor = (kind) => ({
    data: '#57d7ff', skill: '#3ce6b0', model: '#b48bff', knowledge: '#ffc65c', agent: '#ff7a90'
  })[kind] || '#8fd3ff'

  async function loadCesium() {
    if (CesiumMod) return CesiumMod
    // 动态引入：只在真正用 3D 地球时才加载这个重包（约 1MB+）
    const mod = await import('cesium')
    const widgets = await import('cesium/Build/Cesium/Widgets/widgets.css')
    void widgets
    CesiumMod = mod
    return mod
  }

  const toColor = (hex, alpha) => {
    const c = CesiumMod.Color.fromCssColorString(hex)
    return c.withAlpha(alpha)
  }

  async function mount(container, { basemap = 'satellite', projection = '3d', homeView } = {}) {
    if (!container) return false
    if (viewer) return true
    basemapId.value = basemap
    loading.value = true
    try {
      const Cesium = await loadCesium()
      if (!container.isConnected) return false
      viewer = new Cesium.Viewer(container, {
        // 关掉一切与本平台无关的控件，只留地球本体 + 版权信息
        animation: false, timeline: false, baseLayerPicker: false, geocoder: false,
        homeButton: false, sceneModePicker: false, navigationHelpButton: false,
        fullscreenButton: false, infoBox: false, selectionIndicator: false,
        // 诊断用：允许从 canvas 直读像素（scripts/diagnose-map.mjs 依赖它）
        contextOptions: { webgl: { preserveDrawingBuffer: true } },
        baseLayer: Cesium.ImageryLayer.fromProviderAsync(
          Promise.resolve(new Cesium.UrlTemplateImageryProvider({
            url: getBasemap(basemap).rasterTiles,
            credit: getBasemap(basemap).rasterAttribution
          })), {})
      })
      viewer.scene.globe.enableLighting = false
      if (viewer.scene.skyAtmosphere) viewer.scene.skyAtmosphere.show = true
      const home = homeView || { lon: 110, lat: 30, height: 20000000 }
      viewer.camera.setView({ destination: Cesium.Cartesian3.fromDegrees(home.lon, home.lat, home.height) })
      if (projection === '2d') viewer.scene.morphTo2D(0)

      const markReady = (why) => {
        if (ready.value) return
        ready.value = true; loading.value = false; basemapFailed.value = false; slowBasemap.value = false
        if (import.meta.env.DEV) console.debug(`[cesium] 地球就绪（${why}）`)
      }
      // 影像层就绪 + 首次渲染完成即视为可用
      viewer.scene.globe.tileLoadProgressEvent.addEventListener((n) => { if (n === 0) markReady('tiles') })
      viewer.scene.postRender.addEventListener(() => { if (!ready.value && viewer.scene.globe.tilesLoaded) markReady('postRender') })
      if (typeof window !== 'undefined') window.__gnxGlobe = viewer
      setTimeout(() => { if (!ready.value) { loading.value = false; slowBasemap.value = true; error.value = '地球瓦片加载较慢…' } }, TIMEOUT_MS)
      redraw()          // 补画可能在 viewer 就绪前就到达的图层
      return true
    } catch (e) {
      loading.value = false; basemapFailed.value = true
      error.value = `Cesium 初始化失败：${e.message}`
      return false
    }
  }

  function setBasemap(id) {
    const bm = getBasemap(id)
    basemapId.value = bm.id
    if (!viewer || !CesiumMod) return
    try {
      const layers_ = viewer.imageryLayers
      layers_.removeAll()
      layers_.addImageryProvider(new CesiumMod.UrlTemplateImageryProvider({ url: bm.rasterTiles, credit: bm.rasterAttribution }))
      ready.value = false
      tilestats.value = { errors: 0, lastError: '' }
    } catch (e) { error.value = e.message }
  }

  function setProjection(p) {
    if (!viewer) return
    try { p === '2d' ? viewer.scene.morphTo2D(1) : viewer.scene.morphTo3D(1) } catch { /* 忽略 */ }
  }

  function syncLayers(cards) {
    layers.value = (cards || [])
      .filter((c) => Array.isArray(c.bbox) && c.bbox.length === 4)
      .map((c) => ({ id: c.id, title: c.title || c.id, kind: c.type || 'data', bbox: c.bbox, visible: true, opacity: 0.35 }))
    redraw()
  }

  /** 按 state.layers 补齐实体。Cesium 是**异步**加载的：页面可能在 viewer 就绪前
   *  就把数据送进来了，所以 mount 结束时必须再补画一次（否则地球上什么都没有）。 */
  function redraw() {
    const Cesium = CesiumMod
    if (!viewer || !Cesium) return
    for (const l of layers.value) {
      if (entityByLayer.has(l.id)) {
        const e0 = entityByLayer.get(l.id)
        e0.show = l.visible
        if (e0.rectangle) e0.rectangle.material = toColor(colorFor(l.kind), l.opacity)
        continue
      }
      if (entityByLayer.has(l.id)) continue
      const [w, s, e, n] = l.bbox
      const entity = viewer.entities.add({
        id: `geocard-${l.id}`,
        rectangle: {
          coordinates: Cesium.Rectangle.fromDegrees(w, s, e, n),
          material: toColor(colorFor(l.kind), l.opacity),
          outline: true,
          outlineColor: toColor(colorFor(l.kind), 0.9),
          height: 0
        }
      })
      entityByLayer.set(l.id, entity)
    }
    document.documentElement.dataset.mapLayers = String(layers.value.length)
  }

  function setVisible(id, visible) {
    const l = layers.value.find((x) => x.id === id); if (!l) return
    l.visible = visible
    const e = entityByLayer.get(id); if (e) e.show = visible
  }

  function setOpacity(id, opacity) {
    const l = layers.value.find((x) => x.id === id); if (!l) return
    l.opacity = opacity
    const e = entityByLayer.get(id)
    if (e?.rectangle && CesiumMod) e.rectangle.material = toColor(colorFor(l.kind), opacity)
  }

  function fit(bbox) {
    if (!viewer || !CesiumMod || !Array.isArray(bbox) || bbox.length !== 4) return
    const [w, s, e, n] = bbox
    viewer.camera.flyTo({ destination: CesiumMod.Rectangle.fromDegrees(w, s, e, n), duration: 1.2 })
  }

  function fitAll() {
    const boxes = layers.value.map((l) => l.bbox).filter((b) => Array.isArray(b) && b.length === 4)
    if (!boxes.length) return
    const merged = boxes.reduce((a, b) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])], boxes[0])
    fit(merged)
  }

  function destroy() {
    entityByLayer.clear()
    if (viewer) { try { viewer.destroy() } catch { /* 忽略 */ } }
    viewer = null
    ready.value = false; loading.value = false; slowBasemap.value = false
    if (typeof window !== 'undefined') delete window.__gnxGlobe
  }

  const retryBasemap = () => setBasemap(basemapId.value)

  return { mount, destroy, syncLayers, setVisible, setOpacity, fit, fitAll, setBasemap, retryBasemap, colorFor, setProjection }
}
