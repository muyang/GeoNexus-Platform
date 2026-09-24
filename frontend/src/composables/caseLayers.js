import { computed, ref, watch } from 'vue'
import { caseApi } from '@/api'
import { useMap } from '@/composables/map'

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
 *  **非空间案例**（没有 bbox）不进地球：它们进侧栏。硬塞到地图上只会给出一个
 *  假的位置。
 */

export function useCaseLayers() {
  const { syncCaseOverlay, clearCaseOverlay, fit } = useMap()

  const view = ref(null)
  const loading = ref(false)
  const error = ref('')

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

  function pushOverlay() {
    if (!spatial.value) { clearCaseOverlay(); return }
    syncCaseOverlay(
      { aoi: view.value.bbox, components: components.value },
      { provenance: provenanceOn.value && levelsOn.value.L1 }
    )
  }

  async function load(caseId) {
    stopPlayback()
    selectedDeliverable.value = null
    stepIndex.value = 0
    error.value = ''
    if (!caseId) { view.value = null; clearCaseOverlay(); return null }
    loading.value = true
    try {
      view.value = (await caseApi.layers(caseId)).view
      pushOverlay()
      if (spatial.value) fit(view.value.bbox)
      return view.value
    } catch (e) {
      // 不可见的案例对外就是"不存在"：这里同样不区分"没有"和"无权"，只如实显示
      view.value = null; clearCaseOverlay(); error.value = e.message
      return null
    } finally { loading.value = false }
  }

  function clear() { stopPlayback(); view.value = null; clearCaseOverlay() }

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
  function selectDeliverable(deliverableId) {
    selectedDeliverable.value = deliverableId
    // L4：报告联动——选中交付物即展开它的报告面板
    if (deliverableId) levelsOn.value.L4 = true
  }

  /** 图层组（L3）里的每一项就是一个交付物，点它跳到报告。 */
  function deliverableUrl(id) { return caseApi.deliverableReportUrl(id) }

  // flush: 'sync' —— 开关是给地图用的，异步 flush 会让人看到"点了没反应"。
  // 重画本身只是把描述交给引擎，很轻。
  watch(provenanceOn, pushOverlay, { flush: 'sync' })
  watch(levelsOn, pushOverlay, { deep: true, flush: 'sync' })

  return {
    view, loading, error, spatial, steps, groups, reportLayer, components, arclines, timeline,
    levelsOn, provenanceOn, stepIndex, playing, currentStep, selectedDeliverable,
    load, clear, pushOverlay, togglePlayback, stopPlayback, selectStep, selectDeliverable, deliverableUrl
  }
}
