import { computed, ref, shallowRef } from 'vue'
import { createMaplibreEngine } from './engines/maplibre'
import { createCesiumEngine } from './engines/cesium'
import { DEFAULT_BASEMAP } from './basemaps'
import { settingsApi } from '@/api'

/** 地球/地图的统一门面（facade）。
 *
 *  为什么要有这一层：地图引擎由**后台配置**（Cesium 3D 地球 / MapLibre 2D），
 *  两个引擎的 API 不同但页面只该认一套（图层、缩放、底图、可见性…）。
 *  状态集中在门面里，引擎实现只负责写这些 ref —— 因此可以在运行时切换引擎。
 *
 *  注意：地图与 3D 地球共用同一个容器，切换时先销毁旧引擎再挂新的。 */

// ── 共享状态 ────────────────────────────────────────────────────────────────
const engine = ref('cesium')
const projection = ref('3d')
const homeView = ref({ lon: 110, lat: 30, height: 20000000 })
const showGeoCards = ref(true)
const container = shallowRef(null)
const settingsLoaded = ref(false)

const map = shallowRef(null)          // MapLibre 实例（仅 maplibre 引擎使用）
const ready = ref(false)
const loading = ref(false)
const basemapFailed = ref(false)
const slowBasemap = ref(false)
const error = ref('')
//: 真正**挂上去**的引擎（不是"配置里选的那个"）。切换引擎/挂载失败时，
//: 这句话术必须描述屏幕上实际是什么，否则会出现"Flat 的 2D 地图配一句『地球已就绪』"。
const mountedEngine = ref('')
const tilestats = ref({ errors: 0, lastError: '' })
const basemapId = ref(DEFAULT_BASEMAP)
const layers = ref([])
//: 当前选中的案例叠加层（切引擎时用来重放；默认 null = 不画）
const caseOverlay = ref(null)
let caseOverlayOpts = {}

const state = { map, ready, loading, basemapFailed, slowBasemap, error, tilestats, basemapId, layers, caseOverlay, mountedEngine }
const engines = { maplibre: createMaplibreEngine(state), cesium: createCesiumEngine(state) }
const active = () => engines[engine.value] || engines.cesium

/** 读取后台配置（公开可读）。失败就沿用默认值，不影响浏览。 */
async function loadSettings(force = false) {
  if (settingsLoaded.value && !force) return
  try {
    const s = await settingsApi.get()
    engine.value = s['map.engine'] || 'cesium'
    basemapId.value = s['map.basemap'] || DEFAULT_BASEMAP
    projection.value = s['map.projection'] || '3d'
    homeView.value = s['map.homeView'] || homeView.value
    showGeoCards.value = s['map.showGeoCards'] !== false
  } catch { /* 后端不可达：用默认（Cesium 3D 地球 + 卫星影像） */ }
  settingsLoaded.value = true
}

/** 地图状态的一句话说法：三个用到地图的页面（地图 / 案例 / 工作台）共用一套，
 *  免得同一个状态在三处写成三种话（改版前分别写"globe ready""未就绪""加载中…"）。 */
const mapStatus = computed(() => {
  // 以 mountedEngine 为准（回落到配置值）：标签必须与屏幕上那套渲染一致
  const mounted = mountedEngine.value || engine.value
  if (ready.value) return { text: mounted === 'cesium' ? '地球已就绪' : '地图已就绪', cls: 'tag-ok' }
  if (loading.value) return { text: '加载中…', cls: 'tag-mute' }
  if (basemapFailed.value) return { text: '底图不可用（图层仍可用）', cls: 'tag-bad' }
  if (slowBasemap.value) return { text: '底图较慢（图层仍可用）', cls: 'tag-warn' }
  return { text: '未就绪', cls: 'tag-mute' }
})

export function useMap() {
  async function mount(el, opts = {}) {
    await loadSettings()
    container.value = el
    if (!el) return false
    engines.maplibre.destroy()
    engines.cesium.destroy()
    ready.value = false; slowBasemap.value = false; basemapFailed.value = false; error.value = ''
    return active().mount(el, {
      basemap: basemapId.value,
      projection: projection.value,
      homeView: homeView.value,
      ...opts
    })
  }

  async function setEngine(name) {
    if (!engines[name] || name === engine.value) return
    engines.maplibre.destroy()
    engines.cesium.destroy()
    engine.value = name
    ready.value = false; error.value = ''
    layers.value = []
    caseOverlay.value = null
    if (container.value) await active().mount(container.value, { basemap: basemapId.value, projection: projection.value, homeView: homeView.value })
    replayCaseOverlay()
  }

  function setProjection(p) {
    projection.value = p === '2d' ? '2d' : '3d'
    active().setProjection(projection.value)
  }

  function destroy() {
    engines.maplibre.destroy()
    engines.cesium.destroy()
    layers.value = []
  }

  /** 图层同步：引擎挂载可能晚于数据到达，所以统一走 active() 并容错。 */
  function syncLayers(cards) {
    if (!showGeoCards.value) { layers.value = []; return }
    active().syncLayers(cards)
  }

  /** 案例叠加层：与 GeoCard 图层分开，选中案例时才画。 */
  function syncCaseOverlay(overlay, opts = {}) {
    caseOverlay.value = overlay || null
    caseOverlayOpts = opts || {}
    active().syncCaseOverlay?.(caseOverlay.value, caseOverlayOpts)
  }

  /** 引擎挂载或切换完成后重放一次叠加层：数据常常先到、引擎后好。
   *  少了这一步的症状很隐蔽 —— 面板上明明有几何，地球上什么都没有。 */
  function replayCaseOverlay() {
    if (caseOverlay.value) active().syncCaseOverlay?.(caseOverlay.value, caseOverlayOpts)
  }
  function clearCaseOverlay() { caseOverlay.value = null; active().clearCaseOverlay?.() }

  return {
    // 状态
    engine, mountedEngine, projection, ready, loading, basemapFailed, slowBasemap, error, tilestats,
    basemapId, layers, showGeoCards, caseOverlay, mapStatus,
    // 动作
    mount, destroy, setEngine, setProjection, loadSettings,
    syncLayers, syncCaseOverlay, clearCaseOverlay, replayCaseOverlay,
    setVisible: (id, v) => active().setVisible(id, v),
    setOpacity: (id, o) => active().setOpacity(id, o),
    fit: (b) => active().fit(b),
    fitAll: () => active().fitAll(),
    setBasemap: (id) => active().setBasemap(id),
    retryBasemap: () => active().retryBasemap(),
    colorFor: (k) => active().colorFor(k)
  }
}
