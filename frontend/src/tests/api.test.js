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
