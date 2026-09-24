import { get, post, put, request } from './http'

/** 后台管理 API（对应 lib/governance.js 的路由）。 */
export const adminApi = {
  overview: () => get('/api/admin/overview'),
  audit: (limit = 100) => get(`/api/admin/audit?limit=${limit}`),

  modules: () => get('/api/admin/modules'),
  moduleItems: (module) => get(`/api/admin/modules/${encodeURIComponent(module)}/items`),
  createItem: (module, body) => post(`/api/admin/modules/${encodeURIComponent(module)}/items`, body),
  updateItem: (module, id, body) => put(`/api/admin/modules/${encodeURIComponent(module)}/items/${encodeURIComponent(id)}`, body),
  deleteItem: (module, id) => request(`/api/admin/modules/${encodeURIComponent(module)}/items/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  approvals: (status) => get(`/api/approvals${status ? `?status=${status}` : ''}`),
  decide: (id, decision, note) => post(`/api/approvals/${encodeURIComponent(id)}/decide`, { decision, note }),

  quotas: () => get('/api/quotas'),
  setQuota: (body) => post('/api/quotas', body),

  publishGeoCard: (card, nodeUrl = 'platform') => post('/api/sdk/geocards/publish', { card, nodeUrl }),

  // ── 方案与交付物（批 2：后台两个页签的数据面）──
  /** 方案目录 + 平台绑定 + 待审计数（管理面，需 approval:list）。 */
  recipes: (status) => get(`/api/admin/recipes${status ? `?status=${status}` : ''}`),
  /** 交付物清单：可按案例或角色过滤。 */
  deliverables: ({ caseId, role } = {}) => {
    const qs = new URLSearchParams()
    if (caseId) qs.set('caseId', caseId)
    if (role) qs.set('role', role)
    return get(`/api/admin/deliverables${qs.toString() ? `?${qs}` : ''}`)
  },
  /** 发布方案 = 提交审批单（与 GeoCard 发布同一条链路）。 */
  publishRecipe: (recipe, { caseId, params, title } = {}) =>
    post('/api/recipes', { recipe, caseId, params, title }),
  /** 派生一份方案：新地址 + 我的参数，源方案不动。 */
  forkRecipe: (body) => post('/api/recipes/fork', body),
  /** 物化（只看不跑）；参数不合格时后端回 400 且带 field。 */
  planRecipe: (body) => post('/api/recipes/plan', body),
  /** 按方案运行案例（逐级执行，产出交付物）。 */
  runRecipe: (body) => post('/api/recipes/run', body)
}
