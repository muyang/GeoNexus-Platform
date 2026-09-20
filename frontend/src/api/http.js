/** 统一 HTTP 出口：只认 /api 前缀（开发期由 vite 反代到后端，生产期由反向代理分流到 RuoYi/Java）。 */
export class ApiError extends Error {
  constructor(message, { status = 0, code = '', body = null } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.body = body
  }
}

const BASE = import.meta.env.VITE_API_BASE || ''
const DEFAULT_TIMEOUT = 15000

export async function request(path, { method = 'GET', body, headers = {}, timeout = DEFAULT_TIMEOUT, raw = false } = {}) {
  const token = localStorage.getItem('gnx.token')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  try {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal
    })
    const text = await res.text()
    let data = null
    try { data = text ? JSON.parse(text) : null } catch { data = raw ? text : null }
    if (!res.ok) {
      throw new ApiError(data?.error || data?.message || `HTTP ${res.status}`, {
        status: res.status, code: data?.code || '', body: data
      })
    }
    return data
  } catch (err) {
    if (err instanceof ApiError) throw err
    if (err.name === 'AbortError') throw new ApiError('请求超时', { code: 'timeout' })
    throw new ApiError(err.message || '网络不可达', { code: 'offline' })
  } finally {
    clearTimeout(timer)
  }
}

export const get = (p, o) => request(p, { ...o, method: 'GET' })
export const post = (p, body, o) => request(p, { ...o, method: 'POST', body })
export const put = (p, body, o) => request(p, { ...o, method: 'PUT', body })
