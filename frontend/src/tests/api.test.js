import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { ApiError } from '@/api/http'

const ok = (body) => Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(JSON.stringify(body)) })
const fail = (status, body) => Promise.resolve({ ok: false, status, text: () => Promise.resolve(JSON.stringify(body)) })

describe('API 适配层', () => {
  beforeEach(() => { localStorage.clear(); vi.restoreAllMocks() })
  afterEach(() => { vi.unstubAllGlobals() })

  it('带上 Bearer 令牌', async () => {
    localStorage.setItem('gnx.token', 'abc')
    const spy = vi.fn(() => ok({ items: [1] }))
    vi.stubGlobal('fetch', spy)
    const { request } = await import('@/api/http')
    await request('/api/x')
    expect(spy.mock.calls[0][1].headers.Authorization).toBe('Bearer abc')
  })

  it('非 2xx 抛 ApiError 且带 status', async () => {
    vi.stubGlobal('fetch', vi.fn(() => fail(403, { error: 'forbidden' })))
    const { request } = await import('@/api/http')
    await expect(request('/api/x')).rejects.toBeInstanceOf(ApiError)
    await expect(request('/api/x')).rejects.toMatchObject({ status: 403 })
  })

  it('网络异常归一为 offline 码', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))))
    const { request } = await import('@/api/http')
    await expect(request('/api/x')).rejects.toMatchObject({ code: 'offline' })
  })

  it('GeoCard 目录：SDK 代理失败时退回平台目录，再退回演示种子（页面不空白）', async () => {
    const calls = []
    vi.stubGlobal('fetch', vi.fn((url) => {
      calls.push(url)
      if (String(url).includes('/api/sdk/geocards')) return Promise.reject(new TypeError('offline'))
      if (String(url).includes('/api/geocards')) return fail(500, { error: 'boom' })
      return Promise.reject(new TypeError('offline'))
    }))
    const { cardApi } = await import('@/api')
    const r = await cardApi.list()
    expect(r.rows.length).toBeGreaterThan(0)     // 种子数据
    expect(r.degraded).toBe(true)
    expect(calls.some((u) => String(u).includes('/api/sdk/geocards'))).toBe(true)
  })
})

describe('方案与交付物（后台两个页签 + 复用链路）', () => {
  beforeEach(() => { localStorage.clear(); vi.restoreAllMocks() })
  afterEach(() => { vi.unstubAllGlobals() })

  it('后台页签打到正确的端点，并把筛选条件带上', async () => {
    const calls = []
    vi.stubGlobal('fetch', vi.fn((url) => {
      calls.push(String(url))
      if (String(url).includes('/api/admin/recipes')) {
        return ok({ bindings: [{ id: 'crp-1', recipeId: 'recipe://a/b@1.0.0', reusableParams: ['year'] }],
          catalogue: [{ id: 'recipe://a/b@1.0.0' }], pendingApprovals: 2, sdk: { status: 'up' } })
      }
      return ok({ items: [{ id: 'dlv-1', name: 'report', role: 'knowledge', hasArtifact: true }],
        byRole: { knowledge: 1 }, runs: 3, cases: 1 })
    }))
    const { adminApi } = await import('@/api/admin')

    const recipes = await adminApi.recipes()
    expect(recipes.bindings[0].reusableParams).toEqual(['year'])
    expect(recipes.pendingApprovals).toBe(2)
    expect(calls.some((u) => u.includes('/api/admin/recipes'))).toBe(true)

    const deliverables = await adminApi.deliverables({ caseId: 'case-1', role: 'knowledge' })
    expect(deliverables.byRole.knowledge).toBe(1)
    const last = calls.at(-1)
    expect(last).toContain('caseId=case-1')
    expect(last).toContain('role=knowledge')
  })

  it('派生/物化/运行分别走 fork、plan、run —— 平台不自己排 DAG', async () => {
    const calls = []
    vi.stubGlobal('fetch', vi.fn((url, init) => {
      calls.push({ url: String(url), body: init?.body ? JSON.parse(init.body) : null })
      if (String(url).endsWith('/api/recipes/fork')) return ok({ forked: { id: 'recipe://x/y@1.0.0' }, caseId: 'case-9' })
      if (String(url).endsWith('/api/recipes/plan')) return ok({ plan: { run_id: 'r', tasks: [{ step: 's1' }] } })
      return ok({ runId: 'r', steps: [{ step: 's1', status: 'succeeded' }] })
    }))
    const { adminApi } = await import('@/api/admin')

    const forked = await adminApi.forkRecipe({ recipe_id: 'recipe://a/b@1.0.0', params: { year: 2019 } })
    expect(forked.caseId).toBe('case-9')
    expect(calls[0].body.params).toEqual({ year: 2019 })

    await adminApi.planRecipe({ recipe: 'recipe://a/b@1.0.0', params: { year: 1990 } })
    expect(calls[1].url).toContain('/api/recipes/plan')

    const run = await adminApi.runRecipe({ caseId: 'case-9', params: { year: 2019 } })
    expect(run.steps[0].status).toBe('succeeded')
    expect(calls[2].url).toContain('/api/recipes/run')
  })

  it('发布方案 = 提交审批单，不是一个"立刻生效"的写操作', async () => {
    let seen = null
    vi.stubGlobal('fetch', vi.fn((url, init) => {
      seen = { url: String(url), body: JSON.parse(init.body) }
      return ok({ approval: { id: 'apv-1', kind: 'recipe-publish', status: 'pending' } })
    }))
    const { adminApi } = await import('@/api/admin')
    const res = await adminApi.publishRecipe({ id: 'recipe://a/b@1.0.0' }, { caseId: 'case-1', title: 'B' })
    expect(seen.url).toContain('/api/recipes')
    expect(seen.body.recipe.id).toBe('recipe://a/b@1.0.0')
    expect(seen.body.caseId).toBe('case-1')
    expect(res.approval.status).toBe('pending')
  })
})
