import { getBasemap } from '../basemaps'
import { SIZE_BANDS, passesSiteFilter, pc1Band, speciesStar, starText, wetlandStyle } from '../caseStyle'

/** Cesium 后端：3D 地球（默认）。
 *
 *  取舍：Cesium 原生不支持矢量瓦片，所以底图用各底图的**栅格**版本；
 *  地形用 EllipsoidTerrainProvider（不依赖 Ion token，开箱可用）；
 *  需要真实地形/影像时再配 CESIUM_ION_TOKEN。
 *  GeoCard 覆盖范围画成地面矩形，与 MapLibre 后端保持同一套图层语义。 */
export function createCesiumEngine(state) {
  const { ready, loading, basemapFailed, slowBasemap, error, tilestats, basemapId, layers, mountedEngine } = state
  let viewer = null
  let CesiumMod = null
  const entityByLayer = new Map()
  const TIMEOUT_MS = 12000
  //: 影像层已就绪后，再画过这么多帧就认为"地球可用"。
  //: 不用 tilesLoaded 当唯一判据：卫星影像会一直排后台瓦片，tilesLoaded 可以长时间为 false，
  //: 于是标签永远停在"加载中…"，而屏幕上地球早就画出来了（截图复核时发现的）。
  const READY_FRAMES = 5

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
    // 已经挂在这个容器里：什么都不用做。
    // （跨页面复用时容器会换，这时才需要重建 —— 早先直接 `if (viewer) return true`，
    //   换页后地球仍留在旧容器里，新页面的地图卡是空的。）
    if (viewer && container.contains(viewer.canvas)) return true
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
      // 判据一：瓦片队列清空（最快、最准，但可能一直排后台瓦片）
      viewer.scene.globe.tileLoadProgressEvent.addEventListener((n) => { if (n === 0) markReady('tiles') })
      // 判据二：已经连续画出若干帧，且影像图源本身 ready ⇒ 地球可见可用。
      let frames = 0
      viewer.scene.postRender.addEventListener(() => {
        if (ready.value) return
        frames += 1
        if (viewer.scene.globe.tilesLoaded) return markReady('postRender')
        const layer = viewer.imageryLayers.get(0)
        const provider = layer && layer.imageryProvider
        if (frames >= READY_FRAMES && (!provider || provider.ready !== false)) markReady(`frames=${frames}`)
      })
      mountedEngine.value = 'cesium'
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
  /** 把 GeoJSON 画上地球：**颜色 = 湿地类型（沿海/内陆）、大小 = PC1 分档**。
   *  几何是异步加载的（GeoJsonDataSource.load 返回 Promise），所以与 bbox 那条
   *  同步路径分开；画不出来也不该影响底图。
   *
   *  筛选（湿地类型开关注 + 只看未与保护地重叠 + 物种）与面板用同一个 `overlay.siteFilter`
   *  与同一个 `passesSiteFilter()`：面板筛掉的点，地球上也要消失 ——
   *  两边不一致等于给出两个答案。
   *
   *  物种视图（原文 Fig. 3 的视角）：选中物种后，只留原文列出它的站点，并给
   *  over_10pct / over_50pct 的站点套**金色圆环**（一圈 = 超过 10%，两圈 = 超过 50%）。
   *  **点的大小不变** —— 比例原文没公布，用大小去表达比例就是编数据。 */
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
    const filter = (overlay && overlay.siteFilter) || {}
    // 判定只有一份实现（caseStyle），面板与 2D 地图用的是同一个函数
    const passesFilter = (props) => passesSiteFilter(props, filter)
    const species = filter.species === null || filter.species === undefined ? null : Number(filter.species)
    const add = async (name, options) => {
      if (!geometry[name] || visible[name] === false) return
      const source = await Cesium.GeoJsonDataSource.load(geometry[name], options)
      source.name = name
      await viewer.dataSources.add(source)
      caseDataSources.set(name, source)
    }
    // 147 个点：白色符号 + 逐实体着色，颜色只表达湿地类型这一件事
    await add('sites', {
      markerSymbol: 'o', markerColor: Cesium.Color.WHITE,
      markerSize: 28, stroke: Cesium.Color.WHITE.withAlpha(0.9), strokeWidth: 1
    })
    let shown = 0
    let rings = 0
    for (const source of caseDataSources.values()) {
      const ringed = []
      for (const entity of source.entities.values) {
        const props = entity.properties && entity.properties.getValue
          ? entity.properties.getValue(Cesium.JulianDate.now()) : {}
        if (!props || !props.site_id) continue
        const type = wetlandStyle(props.wetland_type)
        const band = SIZE_BANDS[props.pc1_band || pc1Band(props.pc1)] || SIZE_BANDS.xs
        if (entity.billboard) {
          entity.billboard.color = Cesium.Color.fromCssColorString(type.color)
          entity.billboard.scale = band.radius / 8
          // 筛选：不通过的点直接不画（与面板同一套条件）
          entity.show = passesFilter(props)
        } else if (entity.point) {
          entity.point.color = Cesium.Color.fromCssColorString(type.color)
          entity.point.pixelSize = band.radius * 2
          entity.show = passesFilter(props)
        }
        if (entity.show !== false) shown += 1
        const score = typeof props.pc1 === 'number' && props.pc1 !== null
          ? `PC1 ${props.pc1}`
          : (props.rank !== null && props.rank !== undefined ? `原文未公布分值（名次 ${props.rank}）` : '原文未公布分值')
        // 选中物种时，点开一个站点能看到"原文对它的标注"；没选物种就不提这一档
        const star = species === null ? 0 : speciesStar(props, species)
        const starNote = star === 2 ? '　原文标注：★★（超过该物种种群 50%）'
          : star === 1 ? '　原文标注：★（超过该物种种群 10%）' : ''
        const speciesNote = species === null ? '' : `　原文列出该物种：${star ? '是' : '否'}`
        entity.description = `${props.name || props.site_id}　${props.country || ''}　${type.label}　${score}`
          + `　达标物种 ${props.species_count}${speciesNote}${starNote}`
        if (star) ringed.push({ entity, band, star })
      }
      // 金环：一圈 = 原文 over_10pct，两圈 = over_50pct（同心的两圈，不是更大的点）
      if (species !== null) {
        for (const item of ringed) {
          for (const offset of (item.star === 2 ? [5, 10] : [5])) {
            source.entities.add({
              position: item.entity.position,
              point: {
                pixelSize: (item.band.radius + offset) * 2,
                color: Cesium.Color.TRANSPARENT,
                outlineColor: Cesium.Color.fromCssColorString('#ffd479'),
                outlineWidth: 2,
                disableDepthTestDistance: Number.POSITIVE_INFINITY
              }
            })
            rings += 1
          }
        }
      }
    }
    document.documentElement.dataset.caseGeometry = String(caseDataSources.size)
    // 给 CDP 断言用：地球实际显示了多少个站点、加了几圈金环
    document.documentElement.dataset.caseSitesShown = String(shown)
    document.documentElement.dataset.caseSpeciesRings = String(rings)
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
    if (mountedEngine.value === 'cesium') mountedEngine.value = ''
  }

  const retryBasemap = () => setBasemap(basemapId.value)

  return { mount, destroy, syncLayers, syncCaseOverlay, clearCaseOverlay, setVisible, setOpacity, fit, fitAll,
    setBasemap, retryBasemap, colorFor, setProjection }
}
