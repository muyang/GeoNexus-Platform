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

/** 案例图层组合式：四级 LOD + 双时间轴 + 血缘弧线 + 筛选。
 *
 *  这一版的几何是论文的真实数据（147 处优先湿地），夹具取 4 个点就够：
 *  两种湿地类型、一个有分值一个只有名次、一个未与保护地重叠。
 *
 *  这里只测**纯逻辑**（播放、时间轴拆分、弧线默认关、筛选与面板一致），不测渲染：
 *  渲染的断言属于 e2e，塞进单测只会变成"对着实现写死"。 */

const view = {
  caseId: 'case-1', title: '东亚—澳大利亚迁飞区 · 优先湿地识别', spatial: true, bbox: [89.7, -10.05, 140.8, 50.2],
  components: [
    { id: 'geocard.eaaf.rfi-priority-sites', role: 'data', step: null, title: 'EAAF 优先湿地站点级结果（147 处）',
      bbox: [89.7, -10.05, 140.8, 50.2], visibility: 'public' },
    { id: 'geocard.eaaf.waterbird-counts-restricted', role: 'data', step: null, title: '逐笔水鸟计数数据（受限）',
      bbox: [89.7, -10.05, 140.8, 50.2], visibility: 'restricted' },
    { id: 'rfi-pc1-select', role: 'skill', step: 's3', bbox: null, visibility: 'public' }
  ],
  facts: {
    totals: { priority_sites: 147, coastal: 91, inland: 56, protected_table4: 108,
      protected_bold_marks: 117, unprotected_table4: 39, species_reaching_1pct: 959,
      sites_without_pc1: 26, prc_below_threshold: 2 }
  },
  timeline: {
    dataTime: null,
    executionTime: { start: '2026-09-24T10:00:00Z', end: '2026-09-24T10:00:02Z' }
  },
  geometry: [
    { name: 'sites', kind: 'priority-sites', url: '/api/cases/case-1/geometry/sites',
      properties: {
        title: 'EAAF 优先湿地（147 处）',
        source: { doi: '10.1038/s41598-025-31727-2' },
        // 物种清单来自图层元数据；每个要素的 sp / sp10 / sp50 是它的下标
        species: {
          rows: 6, rows_unique: 6, duplicate_rows: 0,
          over_10pct_rows: 3, over_50pct_rows: 1, nearly_1pct_rows: 0,
          index: [
            { i: 0, english: 'Spotted Greenshank', scientific: 'Tringa guttifer', iucn: 'EN' },
            { i: 1, english: 'Spoon-billed Sandpiper', scientific: 'Calidris pygmaea', iucn: 'CR' },
            { i: 2, english: 'Lesser', scientific: 'SandploverCharadrius mongolus', iucn: '' }
          ]
        }
      } }
  ],
  layers: [
    { level: 'L1', kind: 'aoi' },
    { level: 'L2', kind: 'step-footprint', steps: [
      { runId: 'r1', stepId: 's1', skill: 'rfi-framework-review', status: 'succeeded', startedAt: '2026-09-24T10:00:00Z' },
      { runId: 'r2', stepId: 's2', skill: 'rfi-site-data', status: 'succeeded', startedAt: '2026-09-24T10:00:01Z' },
      { runId: 'r3', stepId: 's3', skill: 'rfi-pc1-select', status: 'succeeded', startedAt: '2026-09-24T10:00:02Z' }
    ] },
    { level: 'L3', kind: 'layer-group', groups: [
      { role: 'data', items: [{ deliverableId: 'dlv-1', name: 'priority_sites', mediaType: 'text/csv', status: 'ready' }] },
      { role: 'knowledge', items: [{ deliverableId: 'dlv-2', name: 'report', mediaType: 'text/html', status: 'ready' }] }
    ] },
    { level: 'L4', kind: 'report-panel', available: true, linkage: 'on-select', deliverableId: 'dlv-2' }
  ]
}

const geometryFixtures = {
  // 真实数据的要素不带 synthetic：界面上的"合成为示意"标注不该出现
  sites: { type: 'FeatureCollection', bbox: [89.7, -10.05, 140.8, 50.2], features: [
    { type: 'Feature', properties: { site_id: 'rf001', name: 'Eastern Sundarbans', country: 'Bangladesh',
      wetland_type: 'coastal', protected: true, pc1: 42, rank: null, pc1_band: 'lg', species_count: 2,
      designations: '', threatened: 'CR', sp: [0, 1], sp10: [0], sp50: [] },
      geometry: { type: 'Point', coordinates: [89.7, 22] } },
    { type: 'Feature', properties: { site_id: 'rf052', name: 'Yalu Jiang', country: 'PRC',
      wetland_type: 'coastal', protected: false, pc1: 9.29, rank: null, pc1_band: 'sm', species_count: 1,
      designations: 'FR', threatened: 'EN,VU', sp: [0], sp10: [0], sp50: [0] },
      geometry: { type: 'Point', coordinates: [124.4, 39.9] } },
    { type: 'Feature', properties: { site_id: 'rf104', name: 'Khar-Us Lake', country: 'Mongolia',
      wetland_type: 'inland', protected: true, pc1: null, rank: 1, pc1_band: 'rank', species_count: 1,
      designations: 'FR', threatened: 'VU', sp: [1], sp10: [], sp50: [] },
      geometry: { type: 'Point', coordinates: [92.17, 47.75] } },
    { type: 'Feature', properties: { site_id: 'rf120', name: 'Palawan wetland', country: 'Philippines',
      wetland_type: 'inland', protected: false, pc1: 1, rank: null, pc1_band: 'xs', species_count: 1,
      designations: '', threatened: '', sp: [2], sp10: [], sp50: [] },
      geometry: { type: 'Point', coordinates: [118.5, 9.8] } }
  ] }
}

beforeEach(() => {
  vi.resetModules()
  vi.restoreAllMocks()
  drawn.overlays.length = 0; drawn.cleared = 0; drawn.fitted.length = 0
  vi.stubGlobal('fetch', vi.fn((url) => {
    const body = String(url).includes('/geometry/')
      ? geometryFixtures[String(url).split('/').pop()]
      : { view }
    return Promise.resolve({
      ok: Boolean(body),
      status: body ? 200 : 404,
      text: () => Promise.resolve(JSON.stringify(body || {})),
      json: () => Promise.resolve(body || {})   // 几何走 response.json()
    })
  }))
})
afterEach(() => { vi.unstubAllGlobals() })

describe('案例图层：四级 LOD', () => {
  it('加载后拿到步骤、分组、报告层与组成项', async () => {
    const { useCaseLayers } = await import('@/composables/caseLayers')
    const l = useCaseLayers()
    await l.load('case-1')
    expect(l.spatial.value).toBe(true)
    expect(drawn.overlays.length).toBeGreaterThan(0)
    const last = drawn.overlays.at(-1)
    expect(last.overlay.aoi).toEqual(view.bbox)
    expect(last.opts.provenance).toBe(false, '血缘弧线默认关')
    expect(Object.keys(last.overlay.geometry).sort()).toEqual(['sites'])
    expect(drawn.fitted[0]).toEqual(view.bbox)
    expect(l.steps.value.map((s) => s.stepId)).toEqual(['s1', 's2', 's3'])
    expect(l.groups.value.map((g) => g.role)).toEqual(['data', 'knowledge'])
    expect(l.reportLayer.value.available).toBe(true)
    expect(l.components.value.length).toBe(3)
    // 组成项要带名称：光看 geocard id 认不出是什么数据
    expect(l.components.value.find((c) => c.role === 'data').title).toContain('优先湿地')
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
    expect(l.arclines.value.map((c) => c.id)).toEqual([
      'geocard.eaaf.rfi-priority-sites', 'geocard.eaaf.waterbird-counts-restricted'])
    l.provenanceOn.value = true
    expect(l.provenanceOn.value).toBe(true)
    // 打开后要重画一次，并且**只**画当前这一条案例的弧线
    const last = drawn.overlays.at(-1)
    expect(last.opts.provenance).toBe(true)
    expect(last.overlay.components.filter((c) => Array.isArray(c.bbox)).length).toBe(2)
  })

  it('双时间轴分开：数据时间与执行时间各自独立', async () => {
    const { useCaseLayers } = await import('@/composables/caseLayers')
    const l = useCaseLayers()
    await l.load('case-1')
    const t = l.timeline.value
    // 站点级结果没有单一观测年份：案例声明 null，界面就该显示"未声明"，不编一个时间窗
    expect(t.dataTime).toBeNull()
    expect(t.executionTime.start).toContain('2026-09-24')
    expect(t.separate).toBe(false)
    // 进度按步骤走，不按墙上时钟——重放历史运行时墙上时钟毫无意义
    l.selectStep(2)
    expect(l.timeline.value.progress).toBe(100)
    l.selectStep(0)
    expect(l.timeline.value.progress).toBe(0)
  })

  it('非空间案例不上地球，但图层数据照常可用', async () => {
    const nonSpatial = { ...view, spatial: false, bbox: null, geometry: [] }
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

  it('几何按受控地址取回：点按 PC1 降序，没有分值的排在后面', async () => {
    const { useCaseLayers } = await import('@/composables/caseLayers')
    const l = useCaseLayers()
    await l.load('case-1')
    expect(Object.keys(l.geometry.value)).toEqual(['sites'])
    // 面板列表与表格用同一顺序：PC1 降序，未公布分值的（蒙古只有名次）排最后
    expect(l.siteFeatures.value.map((f) => f.properties.site_id)).toEqual(['rf001', 'rf052', 'rf120', 'rf104'])
    // 真实数据不带 synthetic ⇒ 不该再显示"合成为示意"
    expect(l.notice.value).toBeNull()
    // 图层元数据（来源/图例）随几何描述一起到，界面才能写出"数据从哪来"
    expect(l.sitesMeta.value.source.doi).toBe('10.1038/s41598-025-31727-2')
  })

  it('按湿地类型与保护状态筛选：面板与地球用同一套条件', async () => {
    const { useCaseLayers } = await import('@/composables/caseLayers')
    const l = useCaseLayers()
    await l.load('case-1')
    expect(l.wetlandTotals.value).toEqual({ coastal: 2, inland: 2, other: 0 })
    expect(l.protectionTotals.value).toEqual({ protected: 2, unprotected: 2 })
    expect(l.visibleSites.value.length).toBe(4)

    // 关掉内陆：只剩沿海两个点，并且要重新画一次（地球跟着筛）
    const before = drawn.overlays.length
    l.toggleWetland('inland', false)
    expect(drawn.overlays.length).toBeGreaterThan(before)
    expect(l.visibleSites.value.map((f) => f.properties.site_id)).toEqual(['rf001', 'rf052'])
    expect(drawn.overlays.at(-1).overlay.siteFilter)
      .toEqual({ types: ['coastal'], unprotectedOnly: false, species: null })

    // 只看未与保护地重叠：把 protected === true 的剔除
    l.toggleWetland('inland', true)
    l.unprotectedOnly.value = true
    expect(l.visibleSites.value.map((f) => f.properties.site_id)).toEqual(['rf052', 'rf120'])
    expect(l.hiddenByFilter.value).toBe(2)
    expect(drawn.overlays.at(-1).overlay.siteFilter.unprotectedOnly).toBe(true)
  })

  it('物种清单的计数从要素算出来：站点数、国家数、10% / 50% 标注数', async () => {
    const { useCaseLayers } = await import('@/composables/caseLayers')
    const l = useCaseLayers()
    await l.load('case-1')
    const list = l.speciesList.value
    expect(list.map((r) => r.label)).toEqual([
      'Spotted Greenshank', 'Spoon-billed Sandpiper', 'Lesser'])
    // 斑腿鹬：两个站点（孟加拉 + 中国），其中 2 处原文标 >10%、1 处标 >50%
    const greenshank = list[0]
    expect(greenshank.siteCount).toBe(2)
    expect(greenshank.countries).toEqual(['Bangladesh', 'PRC'])
    expect(greenshank.over10.length).toBe(2)
    expect(greenshank.over50.length).toBe(1)
    // 原文没给名字的条目如实写出来，不拿学名冒充物种名
    expect(list[2].scientific).toBe('SandploverCharadrius mongolus')
    expect(l.speciesOn.value).toBeNull()
  })

  it('选一个物种：面板列表与地球同时只剩这些站点，且能和其它筛选叠加', async () => {
    const { useCaseLayers } = await import('@/composables/caseLayers')
    const l = useCaseLayers()
    await l.load('case-1')
    expect(l.visibleSites.value.length).toBe(4)

    // 选斑腿鹬（下标 0）→ 只剩原文列出它的两个站点，并重新画一次给地球
    const before = drawn.overlays.length
    l.selectSpecies(0)
    expect(drawn.overlays.length).toBeGreaterThan(before)
    expect(l.visibleSites.value.map((f) => f.properties.site_id)).toEqual(['rf001', 'rf052'])
    expect(drawn.overlays.at(-1).overlay.siteFilter.species).toBe(0)
    expect(l.hiddenByFilter.value).toBe(2)
    expect(l.speciesSelected.value.label).toBe('Spotted Greenshank')
    expect(l.speciesSelected.value.countryCount).toBe(2)

    // 叠加：再关掉沿海，就没有站点同时满足（物种筛选不会被覆盖掉）
    l.toggleWetland('coastal', false)
    expect(l.visibleSites.value.length).toBe(0)
    expect(drawn.overlays.at(-1).overlay.siteFilter)
      .toEqual({ types: ['inland'], unprotectedOnly: false, species: 0 })
    l.toggleWetland('coastal', true)

    // 换物种：勺嘴鹬只有 rf001（沿海）与 rf104（内陆），用"只看未与保护地重叠"再叠一层
    l.selectSpecies(1)
    expect(l.visibleSites.value.map((f) => f.properties.site_id)).toEqual(['rf001', 'rf104'])
    l.unprotectedOnly.value = true
    expect(l.visibleSites.value.length).toBe(0)

    // 清空物种：回到全部
    l.unprotectedOnly.value = false
    l.clearSpecies()
    expect(l.speciesOn.value).toBeNull()
    expect(l.visibleSites.value.length).toBe(4)
    expect(drawn.overlays.at(-1).overlay.siteFilter.species).toBeNull()
  })

  it('★ / ★★ 来自原文的两个布尔列，不是比例', async () => {
    const { useCaseLayers } = await import('@/composables/caseLayers')
    const l = useCaseLayers()
    await l.load('case-1')
    const byId = (id) => l.siteFeatures.value.find((f) => f.properties.site_id === id)
    l.selectSpecies(0)
    expect(l.starOf(byId('rf052'))).toBe(2, 'sp50 ⇒ ★★')
    expect(l.starOf(byId('rf001'))).toBe(1, 'sp10 ⇒ ★')
    // 没选物种时不给任何星：星是"该物种在原文明标超过 10%/50%"这件事
    l.clearSpecies()
    expect(l.starOf(byId('rf052'))).toBe(0)
  })

  it('点选地点与图层开关都会重画', async () => {
    const { useCaseLayers } = await import('@/composables/caseLayers')
    const l = useCaseLayers()
    await l.load('case-1')
    expect(l.geometryOn.value.sites).toBe(true)

    // 引擎把点击回调交回来：带 site_id 的要素才被当成"地点"
    const before = drawn.overlays.length
    drawn.overlays.at(-1).opts.onFeatureClick({ site_id: 'rf104', name: 'Khar-Us Lake', pc1: null, rank: 1 })
    expect(l.selectedSite.value.site_id).toBe('rf104')
    drawn.overlays.at(-1).opts.onFeatureClick({ site_id: undefined, some: 'other geometry' })
    expect(l.selectedSite.value.site_id).toBe('rf104', '点到非地点要素不应该清掉已选地点')

    l.toggleGeometry('sites', false)
    expect(drawn.overlays.length).toBeGreaterThan(before)
    expect(drawn.overlays.at(-1).overlay.visible.sites).toBe(false)
    l.toggleGeometry('sites')
    expect(l.geometryOn.value.sites).toBe(true, '不传值时就是取反')
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

describe('案例样式：论文数据的编码', () => {
  it('PC1 分档边界与种子脚本一致；没有分值走 rank 档', async () => {
    const { pc1Band, SIZE_BANDS, SIZE_BAND_ORDER, wetlandStyle } = await import('@/composables/caseStyle')
    expect(pc1Band(825.49)).toBe('xl')
    expect(pc1Band(100)).toBe('xl')
    expect(pc1Band(99.9)).toBe('lg')
    expect(pc1Band(10)).toBe('md')
    expect(pc1Band(9.29)).toBe('sm')
    expect(pc1Band(1)).toBe('xs')
    // 原文未公布分值的站点不能落进"PC1 最低档"——那是在编数据
    expect(pc1Band(null)).toBe('rank')
    expect(pc1Band(undefined)).toBe('rank')
    expect(SIZE_BAND_ORDER.at(-1)).toBe('rank')
    expect(SIZE_BANDS.rank.radius).toBe(SIZE_BANDS.xs.radius)
    expect(wetlandStyle('coastal').label).toBe('沿海湿地')
    expect(wetlandStyle('inland').color).not.toBe(wetlandStyle('coastal').color)
    expect(wetlandStyle('unknown').label).toContain('未标注')
  })

  it('物种筛选是"站点选择"，未知下标与缺失数组都不放行', async () => {
    const { passesSiteFilter, speciesStar, speciesKey } = await import('@/composables/caseStyle')
    const site = { wetland_type: 'coastal', protected: false, sp: [3, 7], sp10: [7], sp50: [] }
    // 不传物种 = 不筛（默认看全部）
    expect(passesSiteFilter(site, { types: ['coastal'] })).toBe(true)
    expect(passesSiteFilter(site, { types: ['coastal'], species: null })).toBe(true)
    expect(passesSiteFilter(site, { types: ['coastal'], species: 3 })).toBe(true)
    expect(passesSiteFilter(site, { types: ['coastal'], species: 4 })).toBe(false)
    // 要素没有 sp 数组（老版本几何）时也不放行，而不是"当作全部都算"
    expect(passesSiteFilter({ wetland_type: 'coastal' }, { types: ['coastal'], species: 0 })).toBe(false)
    expect(speciesStar(site, 7)).toBe(1)
    expect(speciesStar(site, 3)).toBe(0)
    expect(speciesStar(site, null)).toBe(0)
    expect(speciesKey('a', 'b')).not.toBe(speciesKey('ab', ''))
  })
})
