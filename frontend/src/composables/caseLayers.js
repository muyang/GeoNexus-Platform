import { computed, ref, watch } from 'vue'
import { caseApi } from '@/api'
import { useMap } from '@/composables/map'
import {
  GEOMETRY_LAYERS, protectionCounts, sortedSiteFeatures, syntheticNotice, wetlandCounts
} from '@/composables/caseStyle'

/** 案例图层：四级 LOD + 双时间轴 + 血缘弧线。
 *
 *  数据面来自 `/api/cases/:id/layers`（后端只给描述，画法在这里）。这一层负责三件事：
 *
 *   1. **LOD 选择**：L1 案例范围 / L2 步骤足迹+播放 / L3 图层组 / L4 报告联动。
 *      四级不是"四个开关"，而是"看得越来越细"：缩到案例范围时才值得看步骤，
 *      看步骤时才需要跳到产出它的交付物。
 *   2. **双时间轴**：数据时间（这个案例研究的时段）与执行时间（哪一次运行产生的）
 *      是两回事。混在一根轴上，用户就分不清"结果变了"是因为数据换了还是因为重跑过。
 *   3. **血缘弧线**：默认**关**。一开就是一堆线，默认开等于默认看不清；
 *      而且只画当前选中的那一个案例（画全部案例的弧线既慢又没意义）。
 *
 *  **筛选也是数据面的一部分**：湿地类型与"只看未与保护地重叠"两个开关既过滤面板
 *  列表，也交给引擎过滤地球上的点 —— 两边用同一个 `siteFilter`，不允许"面板筛了、
 *  地球没筛"。非空间案例（没有 bbox）不进地球：它们进侧栏。
 */

export function useCaseLayers() {
  const { syncCaseOverlay, clearCaseOverlay, fit } = useMap()

  const view = ref(null)
  const loading = ref(false)
  const error = ref('')
  /** 几何：name → FeatureCollection（从平台受控接口取，前端不自己拼路径） */
  const geometry = ref({})
  const geometryError = ref('')
  const geometryOn = ref(Object.fromEntries(GEOMETRY_LAYERS.map((l) => [l.name, l.defaultOn])))
  /** 被点选的地点（点地图上的点或点列表里的行都会设它） */
  const selectedSite = ref(null)

  // 筛选：按湿地类型（颜色）与保护状态。默认全看 —— 先看全貌，再收窄。
  const wetlandOn = ref({ coastal: true, inland: true })
  const unprotectedOnly = ref(false)

  // 四级 LOD：默认只开 L1+L2（先看清范围与步骤），L3/L4 随选择展开。
  const levelsOn = ref({ L1: true, L2: true, L3: true, L4: true })
  const provenanceOn = ref(false)          // 血缘弧线：默认关
  const stepIndex = ref(0)
  const playing = ref(false)
  const selectedDeliverable = ref(null)
  let playTimer = null

  /** 空间案例才上地球；非空间案例由调用方放进侧栏。 */
  const spatial = computed(() => Boolean(view.value?.spatial && Array.isArray(view.value?.bbox)))
  const steps = computed(() => view.value?.layers?.find((l) => l.kind === 'step-footprint')?.steps || [])
  const groups = computed(() => view.value?.layers?.find((l) => l.kind === 'layer-group')?.groups || [])
  const reportLayer = computed(() => view.value?.layers?.find((l) => l.kind === 'report-panel') || null)
  const components = computed(() => view.value?.components || [])
  const currentStep = computed(() => steps.value[stepIndex.value] || null)
  /** 画出得出来的血缘弧线：两端都要有范围，算子/算力没有 bbox 就不画。 */
  const arclines = computed(() => components.value.filter((c) => Array.isArray(c.bbox) && c.bbox.length === 4))

  const timeline = computed(() => {
    const t = view.value?.timeline || {}
    const data = t.dataTime || null
    const exec = t.executionTime || null
    let progress = 0
    if (exec?.start && exec?.end && steps.value.length > 1) {
      progress = Math.round((stepIndex.value / (steps.value.length - 1)) * 100)
    }
    return {
      dataTime: data ? { start: data.start, end: data.end } : null,
      executionTime: exec ? { start: exec.start, end: exec.end } : null,
      // 两根轴各画各的：把数据时间塞进执行时间轴是最常见的误导
      separate: Boolean(data && exec),
      progress
    }
  })

  /** 案例几何的派生视图（面板与引擎共用这一份，不各自过滤） */
  const sitesLayer = computed(() => geometry.value.sites || null)
  const siteFeatures = computed(() => sortedSiteFeatures(sitesLayer.value))
  const notice = computed(() => syntheticNotice(geometry.value))
  /** 图层自带的元数据（来源、图例、合计）：由平台受控接口随几何描述一起给 */
  const sitesMeta = computed(() => sitesLayer.value?.properties || sitesLayer.value?.metadata || {})
  const wetlandTotals = computed(() => wetlandCounts(sitesLayer.value))
  const protectionTotals = computed(() => protectionCounts(sitesLayer.value))
  /** 筛选条件（面板与引擎共用）：类型开关 + 只看未与保护地重叠 */
  const siteFilter = computed(() => ({
    types: Object.keys(wetlandOn.value).filter((k) => wetlandOn.value[k]),
    unprotectedOnly: unprotectedOnly.value
  }))
  /** 通过筛选的站点：面板列这个，引擎也画这个 */
  const visibleSites = computed(() => siteFeatures.value.filter(passesFilter))
  const hiddenByFilter = computed(() => siteFeatures.value.length - visibleSites.value.length)

  function passesFilter(feature) {
    const props = feature?.properties || {}
    const type = props.wetland_type
    // 只有沿海/内陆两类受开关控制；未标注类型的点跟着"至少开一类"走，不被静默丢掉
    if (type === 'coastal' || type === 'inland') {
      if (wetlandOn.value[type] === false) return false
    } else if (!siteFilter.value.types.length) return false
    if (unprotectedOnly.value && props.protected === true) return false
    return true
  }

  function pushOverlay() {
    if (!spatial.value) { clearCaseOverlay(); return }
    syncCaseOverlay(
      {
        aoi: view.value.bbox,
        components: components.value,
        geometry: geometry.value,
        visible: geometryOn.value,
        // 筛选条件随叠加层一起给引擎：地球上的点和面板列表必须用同一套条件
        siteFilter: siteFilter.value
      },
      {
        provenance: provenanceOn.value && levelsOn.value.L1,
        onFeatureClick: (properties) => {
          // 只把"地点"要素当成选中：水的旧要素没有 site_id，点到它不该清空已选地点
          if (properties && properties.site_id) selectedSite.value = properties
        }
      }
    )
  }

  /** 逐份拉取几何：某一层失败只影响那一层，不该让整个案例打不开。 */
  async function loadGeometry(list) {
    geometry.value = {}
    geometryError.value = ''
    const wanted = (list || []).filter((g) => g && g.url)
    const results = await Promise.all(wanted.map(async (item) => {
      try {
        const response = await fetch(item.url, { headers: { accept: 'application/geo+json, application/json' } })
        if (!response.ok) throw new Error('HTTP ' + response.status)
        const data = await response.json()
        // 图层元数据（来源/图例/合计）在图层描述里，几何本身只是 FeatureCollection：
        // 合并成一份，面板读 `properties` 就能拿到"这份数据从哪来"
        return { name: item.name, data: { ...data, properties: item.properties || {} } }
      } catch (e) {
        return { name: item.name, error: e.message }
      }
    }))
    const next = {}
    const failed = []
    for (const item of results) {
      if (item.data) next[item.name] = item.data
      else failed.push(item.name + ': ' + item.error)
    }
    geometry.value = next
    if (failed.length) geometryError.value = '部分几何加载失败（' + failed.join('；') + '）'
    pushOverlay()
  }

  function toggleGeometry(name, on) {
    const next = on === undefined ? !geometryOn.value[name] : Boolean(on)
    geometryOn.value = { ...geometryOn.value, [name]: next }
  }

  /** 湿地类型开关（颜色图例点一下就能只留一类）。 */
  function toggleWetland(type, on) {
    if (type !== 'coastal' && type !== 'inland') return
    const next = on === undefined ? !wetlandOn.value[type] : Boolean(on)
    wetlandOn.value = { ...wetlandOn.value, [type]: next }
  }

  function selectSite(properties) { selectedSite.value = properties || null }

  async function load(caseId) {
    stopPlayback()
    selectedDeliverable.value = null
    stepIndex.value = 0
    selectedSite.value = null
    wetlandOn.value = { coastal: true, inland: true }
    unprotectedOnly.value = false
    error.value = ''
    if (!caseId) { view.value = null; clearCaseOverlay(); return null }
    loading.value = true
    try {
      view.value = (await caseApi.layers(caseId)).view
      pushOverlay()
      if (spatial.value) fit(view.value.bbox)
      // 图层描述先到就能出面板；几何到了再上图
      await loadGeometry(view.value.geometry)
      return view.value
    } catch (e) {
      // 不可见的案例对外就是"不存在"：这里同样不区分"没有"和"无权"，只如实显示
      view.value = null; clearCaseOverlay(); error.value = e.message
      return null
    } finally { loading.value = false }
  }

  function clear() {
    stopPlayback(); view.value = null; geometry.value = {}; selectedSite.value = null
    selectedDeliverable.value = null; reportBlobUrl.value = ''; reportError.value = ''
    for (const url of blobUrls.values()) URL.revokeObjectURL(url)
    blobUrls.clear()
    clearCaseOverlay()
  }

  /** L2 播放：按执行顺序走一遍步骤足迹。 */
  function stopPlayback() {
    playing.value = false
    if (playTimer) { clearInterval(playTimer); playTimer = null }
  }
  function togglePlayback() {
    if (playing.value) { stopPlayback(); return }
    if (steps.value.length < 2) return
    playing.value = true
    playTimer = setInterval(() => {
      if (stepIndex.value >= steps.value.length - 1) { stopPlayback(); return }
      stepIndex.value += 1
    }, 900)
  }
  function selectStep(index) {
    stopPlayback()
    stepIndex.value = Math.max(0, Math.min(index, Math.max(steps.value.length - 1, 0)))
  }
  async function selectDeliverable(deliverableId) {
    selectedDeliverable.value = deliverableId
    reportBlobUrl.value = ''; reportError.value = ''
    if (deliverableId) {
      try { reportBlobUrl.value = await deliverableBlobUrl(deliverableId) }
      catch (e) { reportError.value = e.message }
    }
    // L4：报告联动——选中交付物即展开它的报告面板
    if (deliverableId) levelsOn.value.L4 = true
  }

  /** 图层组（L3）里的每一项就是一个交付物，点它跳到报告。 */
  function deliverableUrl(id) { return caseApi.deliverableReportUrl(id) }

  /** 交付物要用带令牌的请求取回来，再变成 blob URL。
   *
   *  为什么不能直接把 `/api/deliverables/:id/report` 放进 `<a href>` / `<iframe src>`：
   *  那条接口要 `Authorization: Bearer`，而浏览器导航不会带自定义头 —— 结果是新窗口
   *  里一个 401。交付物是案例的结论，点开必须真的能看到；所以这里取回字节、转成
   *  blob URL 再用。blob 与页面同源，报告里的相对链接与内嵌资源不受影响。
   */
  const blobUrls = new Map()
  const reportBlobUrl = ref('')
  const reportError = ref('')

  async function deliverableBlobUrl(id) {
    if (!id) return ''
    if (blobUrls.has(id)) return blobUrls.get(id)
    const token = localStorage.getItem('gnx.token')
    const res = await fetch(caseApi.deliverableReportUrl(id), {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    })
    if (!res.ok) throw new Error(res.status === 401 ? '需要登录后才能查看交付物' : `HTTP ${res.status}`)
    const url = URL.createObjectURL(await res.blob())
    blobUrls.set(id, url)
    return url
  }

  async function openDeliverable(id) {
    // 先同步开一个空白页，再填内容：`await` 之后调 window.open 不算用户手势，
    // 多数浏览器会当成弹窗拦掉（点"查看报告"什么都没发生，是最难查的那种 bug）。
    const win = window.open('', '_blank')
    try {
      const url = await deliverableBlobUrl(id)
      if (!url) { win?.close(); return }
      if (win) win.location.href = url
      else window.location.href = url
    } catch (e) {
      win?.close()
      error.value = e.message
    }
  }

  // flush: 'sync' —— 开关是给地图用的，异步 flush 会让人看到"点了没反应"。
  // 重画本身只是把描述交给引擎，很轻。
  watch(provenanceOn, pushOverlay, { flush: 'sync' })
  watch(levelsOn, pushOverlay, { deep: true, flush: 'sync' })
  watch(geometryOn, pushOverlay, { deep: true, flush: 'sync' })
  watch([wetlandOn, unprotectedOnly], pushOverlay, { deep: true, flush: 'sync' })

  return {
    view, loading, error, spatial, steps, groups, reportLayer, components, arclines, timeline,
    levelsOn, provenanceOn, stepIndex, playing, currentStep, selectedDeliverable,
    geometry, geometryOn, geometryError, sitesLayer, sitesMeta, siteFeatures, visibleSites,
    hiddenByFilter, wetlandTotals, protectionTotals, wetlandOn, unprotectedOnly, siteFilter,
    notice, selectedSite, toggleGeometry, toggleWetland, selectSite,
    load, clear, pushOverlay, togglePlayback, stopPlayback, selectStep, selectDeliverable, deliverableUrl,
    reportBlobUrl, reportError, openDeliverable
  }
}
