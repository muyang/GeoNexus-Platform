import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

/** 地图门面用桩替掉：本用例测的是"画什么、什么时候画"，不是引擎本身。
 *  （真引擎会 import maplibre-gl / cesium，那是浏览器环境的事。） */
const drawn = { overlays: [], cleared: 0, fitted: [] }
vi.mock('@/composables/map', () => ({
  useMap: () => ({
    caseOverlay: { value: null },
    syncCaseOverlay: (overlay, opts) => { drawn.overlays.push({ overlay, opts }) },
    clearCaseOverlay: () => { drawn.cleared += 1 },
    fit: (bbox) => { drawn.fitted.push(bbox) }
  })
}))

/** 案例图层组合式：四级 LOD + 双时间轴 + 血缘弧线。
 *
 *  这里只测**纯逻辑**（播放、时间轴拆分、弧线默认关、非空间路由），不测渲染：
 *  渲染的断言属于 e2e，塞进单测只会变成"对着实现写死"。 */

const view = {
  caseId: 'case-1', title: '墨西哥土地退化', spatial: true, bbox: [110.4, 14.5, 117.1, 32.7],
  components: [
    { id: 'data-a', role: 'data', step: 's1', bbox: [87.7, 41.6, 119.9, 52.1], visibility: 'public' },
    { id: 'op', role: 'skill', step: 's2', bbox: null, visibility: 'public' }
  ],
  timeline: {
    dataTime: { start: '2019-01-01', end: '2019-12-31' },
    executionTime: { start: '2026-09-24T10:00:00Z', end: '2026-09-24T10:00:02Z' }
  },
  layers: [
    { level: 'L1', kind: 'aoi' },
    { level: 'L2', kind: 'step-footprint', steps: [
      { runId: 'r1', stepId: 's1', skill: 'aoi', status: 'succeeded', startedAt: '2026-09-24T10:00:00Z' },
      { runId: 'r2', stepId: 's2', skill: 'degrade', status: 'succeeded', startedAt: '2026-09-24T10:00:01Z' },
      { runId: 'r3', stepId: 's3', skill: 'report', status: 'succeeded', startedAt: '2026-09-24T10:00:02Z' }
    ] },
    { level: 'L3', kind: 'layer-group', groups: [
      { role: 'data', items: [{ deliverableId: 'dlv-1', name: 'degradation_map', mediaType: 'image/tiff', status: 'ready' }] },
      { role: 'knowledge', items: [{ deliverableId: 'dlv-2', name: 'report', mediaType: 'text/html', status: 'ready' }] }
    ] },
    { level: 'L4', kind: 'report-panel', available: true, linkage: 'on-select', deliverableId: 'dlv-2' }
  ]
}

beforeEach(() => {
  vi.resetModules()
  vi.restoreAllMocks()
  drawn.overlays.length = 0; drawn.cleared = 0; drawn.fitted.length = 0
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
    ok: true, status: 200, text: () => Promise.resolve(JSON.stringify({ view }))
  })))
})
afterEach(() => { vi.unstubAllGlobals() })

describe('案例图层：四级 LOD', () => {
  it('加载后拿到步骤、分组、报告层与组成项', async () => {
    const { useCaseLayers } = await import('@/composables/caseLayers')
    const l = useCaseLayers()
    await l.load('case-1')
    expect(l.spatial.value).toBe(true)
    expect(drawn.overlays.length).toBe(1, '空间案例加载后要画一次叠加层')
    expect(drawn.overlays[0].overlay.aoi).toEqual(view.bbox)
    expect(drawn.overlays[0].opts.provenance).toBe(false, '血缘弧线默认关')
    expect(drawn.fitted[0]).toEqual(view.bbox)
    expect(l.steps.value.map((s) => s.stepId)).toEqual(['s1', 's2', 's3'])
    expect(l.groups.value.map((g) => g.role)).toEqual(['data', 'knowledge'])
    expect(l.reportLayer.value.available).toBe(true)
    expect(l.components.value.length).toBe(2)
  })

  it('播放按执行顺序推进，到最后一步自停', async () => {
    vi.useFakeTimers()
    try {
      const { useCaseLayers } = await import('@/composables/caseLayers')
      const l = useCaseLayers()
      await l.load('case-1')
      expect(l.currentStep.value.stepId).toBe('s1')
      l.togglePlayback()
      expect(l.playing.value).toBe(true)
      vi.advanceTimersByTime(1000)
      expect(l.currentStep.value.stepId).toBe('s2')
      vi.advanceTimersByTime(2000)
      expect(l.currentStep.value.stepId).toBe('s3')
      expect(l.playing.value).toBe(false, '到最后一步要自停，不能空转')
      // 手动选择会停下播放
      l.togglePlayback(); l.selectStep(0)
      expect(l.playing.value).toBe(false)
      expect(l.stepIndex.value).toBe(0)
    } finally { vi.useRealTimers() }
  })

  it('血缘弧线默认关，且只算画得出来的（两端都要有范围）', async () => {
    const { useCaseLayers } = await import('@/composables/caseLayers')
    const l = useCaseLayers()
    await l.load('case-1')
    expect(l.provenanceOn.value).toBe(false, '默认关：一开就是一堆线，默认开等于默认看不清')
    expect(l.arclines.value.map((c) => c.id)).toEqual(['data-a'])
    l.provenanceOn.value = true
    expect(l.provenanceOn.value).toBe(true)
    // 打开后要重画一次，并且**只**画当前这一条案例的弧线
    const last = drawn.overlays.at(-1)
    expect(last.opts.provenance).toBe(true)
    expect(last.overlay.components.filter((c) => Array.isArray(c.bbox)).length).toBe(1)
  })

  it('双时间轴分开：数据时间与执行时间各自独立', async () => {
    const { useCaseLayers } = await import('@/composables/caseLayers')
    const l = useCaseLayers()
    await l.load('case-1')
    const t = l.timeline.value
    expect(t.separate).toBe(true)
    expect(t.dataTime.start).toBe('2019-01-01')
    expect(t.executionTime.start).toContain('2026-09-24')
    // 进度按步骤走，不按墙上时钟——重放历史运行时墙上时钟毫无意义
    l.selectStep(2)
    expect(l.timeline.value.progress).toBe(100)
    l.selectStep(0)
    expect(l.timeline.value.progress).toBe(0)
  })

  it('非空间案例不上地球，但图层数据照常可用', async () => {
    const nonSpatial = { ...view, spatial: false, bbox: null }
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
      ok: true, status: 200, text: () => Promise.resolve(JSON.stringify({ view: nonSpatial }))
    })))
    const { useCaseLayers } = await import('@/composables/caseLayers')
    const l = useCaseLayers()
    await l.load('case-2')
    expect(l.spatial.value).toBe(false)
    expect(l.steps.value.length).toBe(3)
    const { useMap } = await import('@/composables/map')
    expect(useMap().caseOverlay.value).toBeNull()
  })

  it('不可见的案例（后端 404）不抛异常，只显示为"不存在"', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
      ok: false, status: 404, text: () => Promise.resolve(JSON.stringify({ error: '案例不存在' }))
    })))
    const { useCaseLayers } = await import('@/composables/caseLayers')
    const l = useCaseLayers()
    const result = await l.load('case-hidden')
    expect(result).toBeNull()
    expect(l.view.value).toBeNull()
    expect(l.error.value).toContain('案例不存在')
  })
})
