import { get, post } from './http'
import { seedGeoCards, seedCases, seedFlows, seedKnowledge } from './seed'

/** 身份：端点与既有 Node BFF 一致；换成 RuoYi 时只改这里。
 *  RuoYi 对应：POST /login、POST /register、GET /getInfo */
export const authApi = {
  async login(email, password) {
    const data = await post('/api/auth/login', { email, password })
    return normalizeAuth(data)
  },
  async register(form) {
    const data = await post('/api/auth/register', form)
    return normalizeAuth(data)
  },
  async me() {
    const data = await get('/api/auth/me')
    return data || {}
  }
}

/** 后端返回 { user, token, expiresAt } —— 补上 claim 形状，前端判定逻辑与后端解耦。 */
function normalizeAuth(data) {
  const payload = data || {}
  const scopes = payload.scopes || payload.user?.scopes || defaultScopesFor(payload.user)
  return {
    token: payload.token,
    user: payload.user,
    roles: payload.roles || payload.user?.roles || ['org_member'],
    scopes,
    tenant: payload.user?.org,
    expiresAt: payload.expiresAt
  }
}

/** 自助注册的公众账号只拿到"能看"；机构账号由管理员开户（见 user-management.md §4.1）。 */
function defaultScopesFor(user) {
  if (!user) return ['earth:view']
  return ['earth:view', 'card:read', 'case:read']
}

async function withFallback(live, seed, source) {
  try {
    const data = await live()
    const rows = Array.isArray(data) ? data : data?.items || data?.data || []
    if (rows.length) return { rows, source, degraded: false }
  } catch (err) {
    return { rows: seed, source: `${source} · 离线`, degraded: true, error: err.message }
  }
  return { rows: seed, source: `${source} · 空`, degraded: true }
}

/** GeoCard 目录：优先走平台代理到 SDK Registry（/api/sdk/geocards），
 *  代理不可用时退回后端本地目录，再退回演示种子 —— 页面永不空白。 */
export const cardApi = {
  async list() {
    const r = await withFallback(() => get('/api/sdk/geocards'), seedGeoCards, 'SDK Registry')
    if (!r.degraded) return r
    return withFallback(() => get('/api/geocards'), r.rows, '平台目录')
  }
}

export const caseApi = {
  list: () => withFallback(() => get('/api/sdk/cases'), seedCases, '案例库')
}

export const workbenchApi = {
  flows: () => withFallback(() => get('/api/plan'), seedFlows, '工作台')
}

export const knowledgeApi = {
  async graph(level = 'country') {
    try {
      const data = await get(`/api/geokg/graph?level=${encodeURIComponent(level)}`)
      return { graph: data, source: 'GeoKG', degraded: false }
    } catch (err) {
      return { graph: seedKnowledge, source: 'GeoKG · 离线', degraded: true, error: err.message }
    }
  }
}

export const systemApi = {
  async health() {
    try { return await get('/api/health') } catch { return { status: 'unknown' } }
  }
}
