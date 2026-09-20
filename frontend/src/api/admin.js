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

  publishGeoCard: (card, nodeUrl = 'platform') => post('/api/sdk/geocards/publish', { card, nodeUrl })
}
