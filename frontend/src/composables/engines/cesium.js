import { getBasemap } from '../basemaps'
import { PC1_BANDS, WATER_CLASS_STYLE } from '../caseStyle'

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
    data: '#57d7ff', skill: '#3ce6b0', model: '#b48bff', knowledge: '#ffc65c', agent: '#ff7a90',
    workflow: '#7fe3ff', compute: '#9aa7c7'
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

      // 拾取：把实体属性交给上层面板（PC1、达标种群数…）。
      // **必须在 Cesium 加载完成之后** —— 之前放在 mount 开头，直接
      // "Cesium is not defined"，整个引擎挂掉、地球全黑（真机截图才发现）。
      viewerSelectionHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas)
      viewerSelectionHandler.setInputAction((click) => {
        const picked = viewer.scene.pick(click.position)
        const entity = picked && picked.id
        if (entity && entity.properties && entity.properties.getValue && featureClick) {
          featureClick(entity.properties.getValue(Cesium.JulianDate.now()))
        }
      }, Cesium.ScreenSpaceEventType.LEFT_CLICK)

      const markReady = (why) => {
        if (ready.value) return
        if (pendingOverlay) syncCaseOverlay(pendingOverlay, { provenance: pendingProvenance })
        if (pendingFit) fit(pendingFit)
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

  const caseEntities = new Map()
  const caseDataSources = new Map()
  let featureClick = null
  let pendingOverlay = null
  let pendingProvenance = false
  let pendingFit = null
  let viewerSelectionHandler = null

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

  /** 案例叠加层：AOI 面（L1）、组成项（数据范围）、血缘弧线（默认关）。
   *  与 GeoCard 图层分开管理：选中哪个案例只影响这一层，不重画整个目录。 */
  /** 把 GeoJSON 画上地球：面按 class 配色，点按 PC1 分级定大小与颜色。
   *  几何是异步加载的（GeoJsonDataSource.load 返回 Promise），所以与 bbox 那条
   *  同步路径分开；画不出来也不该影响底图。 */
  async function drawCaseGeometry(overlay) {
    const Cesium = CesiumMod
    if (!viewer || !Cesium) return
    for (const key of [...caseDataSources.keys()]) {
      const source = caseDataSources.get(key)
      try { viewer.dataSources.remove(source, true) } catch { /* 已移除 */ }
      caseDataSources.delete(key)
    }
    const geometry = (overlay && overlay.geometry) || {}
    const visible = (overlay && overlay.visible) || {}
    const add = async (name, options) => {
      if (!geometry[name] || visible[name] === false) return
      const source = await Cesium.GeoJsonDataSource.load(geometry[name], options)
      source.name = name
      await viewer.dataSources.add(source)
      caseDataSources.set(name, source)
    }
    await add('water_baseline', {
      stroke: Cesium.Color.fromCssColorString(WATER_CLASS_STYLE.stable.color).withAlpha(0.8),
      fill: Cesium.Color.TRANSPARENT, strokeWidth: 2
    })
    await add('water_change', {
      stroke: Cesium.Color.fromCssColorString(WATER_CLASS_STYLE.loss.color).withAlpha(1),
      fill: Cesium.Color.fromCssColorString(WATER_CLASS_STYLE.loss.color).withAlpha(WATER_CLASS_STYLE.loss.opacity),
      strokeWidth: 1.5
    })
    await add('sites', {
      markerSymbol: 'o', markerColor: Cesium.Color.fromCssColorString(PC1_BANDS.high.color),
      markerSize: 24, stroke: Cesium.Color.WHITE.withAlpha(0.9), strokeWidth: 1
    })
    for (const source of caseDataSources.values()) {
      for (const entity of source.entities.values) {
        const props = entity.properties && entity.properties.getValue
          ? entity.properties.getValue(Cesium.JulianDate.now()) : {}
        if (props && props.class && WATER_CLASS_STYLE[props.class]) {
          const style = WATER_CLASS_STYLE[props.class]
          if (entity.polygon) {
            entity.polygon.material = Cesium.Color.fromCssColorString(style.color).withAlpha(style.opacity)
            // 碎片化的水面斑块在卫星底图上单靠填充不够醒目：同色描边让边界可读
            if (entity.polygon.outline !== undefined) {
              entity.polygon.outline = true
              entity.polygon.outlineColor = Cesium.Color.fromCssColorString(style.color)
              entity.polygon.outlineWidth = 2
            }
          }
          entity.description = style.label + '（' + (props.pixels || 0) + ' 像元）'
        }
        if (props && props.pc1 !== undefined) {
          const band = PC1_BANDS[props.pc1_band] || PC1_BANDS.low
          if (entity.billboard) {
            entity.billboard.color = Cesium.Color.fromCssColorString(band.color)
            entity.billboard.scale = band.radius / 8
          }
          entity.description = (props.name || props.site_id) + '　PC1 ' + props.pc1
            + '　达标种群 ' + props.species_meeting_1pct
        }
      }
    }
    document.documentElement.dataset.caseGeometry = String(caseDataSources.size)
  }
  function syncCaseOverlay(overlay, { provenance = false, onFeatureClick = null } = {}) {
    const Cesium = CesiumMod
    // 数据常常比引擎先到（子组件 onMounted 先于父组件里的地图挂载）。
    // 存下最后一次请求，等就绪时补画 —— 否则症状是"面板有几何、地球上什么都没有"。
    pendingOverlay = overlay
    pendingProvenance = provenance
    if (onFeatureClick) featureClick = onFeatureClick
    if (!viewer || !Cesium) return
    for (const key of [...caseEntities.keys()]) {
      const e = caseEntities.get(key)
      try { viewer.entities.remove(e) } catch { /* 已移除 */ }
      caseEntities.delete(key)
    }
    if (!overlay) { document.documentElement.dataset.caseOverlay = '0'; return }

    const [w, s, e, n] = overlay.aoi || []
    if (Array.isArray(overlay.aoi) && overlay.aoi.length === 4) {
      caseEntities.set('aoi', viewer.entities.add({
        id: 'case-aoi',
        rectangle: {
          coordinates: Cesium.Rectangle.fromDegrees(w, s, e, n),
          material: toColor('#57d7ff', 0.22),
          outline: true, outlineColor: toColor('#8fe6ff', 0.95), height: 0
        }
      }))
    }

    for (const component of overlay.components || []) {
      if (!Array.isArray(component.bbox) || component.bbox.length !== 4) continue
      const [cw, cs, ce, cn] = component.bbox
      caseEntities.set(`component-${component.id}`, viewer.entities.add({
        id: `case-component-${component.id}`,
        rectangle: {
          coordinates: Cesium.Rectangle.fromDegrees(cw, cs, ce, cn),
          material: toColor(colorFor(component.role), 0.12),
          outline: true, outlineColor: toColor(colorFor(component.role), 0.55), height: 0
        }
      }))
    }

    // 血缘弧线：默认**关**，按需开，而且只画当前选中的这一个案例。
    if (provenance && Array.isArray(overlay.aoi)) {
      const caseCentre = [(w + e) / 2, (s + n) / 2]
      for (const component of overlay.components || []) {
        if (!Array.isArray(component.bbox) || component.bbox.length !== 4) continue
        const centre = [(component.bbox[0] + component.bbox[2]) / 2, (component.bbox[1] + component.bbox[3]) / 2]
        caseEntities.set(`arc-${component.id}`, viewer.entities.add({
          id: `case-arc-${component.id}`,
          polyline: {
            positions: Cesium.Cartesian3.fromDegreesArrayHeights([
              centre[0], centre[1], 0, caseCentre[0], caseCentre[1], 800000, caseCentre[0], caseCentre[1], 0
            ]),
            width: 1.6,
            material: toColor(colorFor(component.role), 0.7)
          }
        }))
      }
    }
    document.documentElement.dataset.caseOverlay = String(caseEntities.size)
    if (onFeatureClick) featureClick = onFeatureClick
    drawCaseGeometry(overlay).catch((err) => {
      console.error('[cesium] 案例几何绘制失败:', err && err.message ? err.message : err)
      document.documentElement.dataset.caseGeometryError = String(err && err.message ? err.message : err)
    })
  }

  function clearCaseOverlay() { syncCaseOverlay(null) }

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
    if (!Array.isArray(bbox) || bbox.length !== 4) return
    if (!viewer || !CesiumMod) { pendingFit = bbox; return }
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
    caseEntities.clear()
    caseDataSources.clear()
    if (viewerSelectionHandler) { try { viewerSelectionHandler.destroy() } catch { /* 已销毁 */ } viewerSelectionHandler = null }
    if (viewer) { try { viewer.destroy() } catch { /* 忽略 */ } }
    viewer = null
    ready.value = false; loading.value = false; slowBasemap.value = false
    if (typeof window !== 'undefined') delete window.__gnxGlobe
  }

  const retryBasemap = () => setBasemap(basemapId.value)

  return { mount, destroy, syncLayers, syncCaseOverlay, clearCaseOverlay, setVisible, setOpacity, fit, fitAll,
    setBasemap, retryBasemap, colorFor, setProjection }
}
