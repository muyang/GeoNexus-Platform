import { get, post, put } from './http'
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
  list: () => withFallback(() => get('/api/sdk/cases'), seedCases, '案例库'),
  /** 案例复跑：平台把案例的 runSpec 翻译成一次 SDK 执行（见 docs/backend-governance.md）。 */
  run: (caseId) => post(`/api/cases/${encodeURIComponent(caseId)}/run`),
  runs: (caseId) => get(`/api/cases/${encodeURIComponent(caseId)}/runs`),
  runDetail: (runId) => get(`/api/runs/${encodeURIComponent(runId)}`),
  cancelRun: (runId) => post(`/api/runs/${encodeURIComponent(runId)}/cancel`),
  /** 产物地址：SDK 不提供文件服务，由平台受控转发（白名单根目录）。 */
  artifactUrl: (runId, name) => `/api/runs/${encodeURIComponent(runId)}/artifacts/${encodeURIComponent(name)}`
}

export const workbenchApi = {
  flows: () => withFallback(() => get('/api/plan'), seedFlows, '工作台')
}

export const knowledgeApi = {
  /** 概览用 /health：给数据版本与图规模。**不要**用 /graph 当概览——
   *  GeoKG 的 /graph 要求 focus 是必填（没有"按层级列全图"这种模式，传 level 会 422，实测踩过）。 */
  async health() {
    try {
      const data = await get('/api/geokg/health')
      return { health: data, source: 'GeoKG', degraded: false }
    } catch (err) {
      return { health: null, source: 'GeoKG · 离线', degraded: true, error: err.message }
    }
  },

  /** 以某实体为中心的子图（图谱视图）。focus 必填：先用 /search 查 id。 */
  async graph(focus, { depth = 2, direction = 'both', limit = 200 } = {}) {
    if (!focus) throw new Error('knowledgeApi.graph 需要 focus（先用 /search 查实体 id）')
    const q = new URLSearchParams({ focus, depth: String(depth), direction, limit: String(limit) })
    try {
      const data = await get(`/api/geokg/graph?${q.toString()}`)
      return { graph: data, source: 'GeoKG', degraded: false }
    } catch (err) {
      return { graph: seedKnowledge, source: 'GeoKG · 离线', degraded: true, error: err.message }
    }
  },

  async search(query, limit = 10) {
    const q = new URLSearchParams({ q: query, limit: String(limit) })
    return get(`/api/geokg/search?${q.toString()}`)
  }
}

export const settingsApi = {
  /** 站点设置：公开可读（前端要知道用哪个地图引擎）。 */
  get: () => get('/api/settings'),
  /** 修改需管理员权限（后台管理 · 地图设置）。 */
  update: (patch) => put('/api/settings', patch)
}

export const systemApi = {
  async health() {
    try { return await get('/api/health') } catch { return { status: 'unknown' } }
  }
}
