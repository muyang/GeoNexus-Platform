import { defineStore } from 'pinia'
import { authApi } from '@/api'

const TOKEN_KEY = 'gnx.token'

/** 身份与权限（最小可用形态）。
 *
 * 令牌契约按目标架构的 claim 设计：roles（粗粒度）+ scopes（细粒度）+ tenant/deptId，
 * 因此后端从 Node BFF 换成 RuoYi（Java）时，本文件只需改 api 基址，不改判定逻辑。 */
export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: localStorage.getItem(TOKEN_KEY) || '',
    user: null,
    roles: [],
    scopes: [],
    tenant: null,
    deptId: null,
    ready: false
  }),
  getters: {
    loggedIn: (s) => Boolean(s.token),
    displayName: (s) => s.user?.name || s.user?.email || '',
    isAdmin: (s) => s.roles.includes('platform_admin') || s.roles.includes('admin')
  },
  actions: {
    apply(payload) {
      this.token = payload.token || this.token
      this.user = payload.user || this.user
      const claims = payload.claims || payload.user?.claims || {}
      this.roles = payload.roles || claims.roles || this.roles
      this.scopes = payload.scopes || claims.scopes || this.scopes
      this.tenant = payload.tenant ?? claims.tenant ?? this.tenant
      this.deptId = payload.deptId ?? claims.deptId ?? this.deptId
      if (this.token) localStorage.setItem(TOKEN_KEY, this.token)
      this.ready = true
    },
    async login(email, password) {
      const data = await authApi.login(email, password)
      this.apply(data)
      return data
    },
    async register(form) {
      const data = await authApi.register(form)
      this.apply(data)
      return data
    },
    /** 刷新后会话仍在，但 user/roles 丢了 —— 用 /me 还原；失败则清态。 */
    async restore() {
      if (!this.token) { this.ready = true; return }
      try {
        const me = await authApi.me()
        this.apply({ user: me.user, token: me.token || this.token, ...me })
      } catch {
        this.logout()
      } finally {
        this.ready = true
      }
    },
    /** 仅开发期：无后端也能预览页面（生产构建里 import.meta.env.DEV 为 false，不会被带上）。 */
    applyDemoSession() {
      this.apply({
        token: 'demo-session',
        user: { id: 'demo', name: '演示账号', email: 'demo@local', org: 'GeoNexus · 离线演示' },
        roles: ['platform_admin'],
        scopes: ['*']
      })
    },
    logout() {
      this.token = ''
      this.user = null
      this.roles = []
      this.scopes = []
      localStorage.removeItem(TOKEN_KEY)
      this.ready = true
    },
    hasRole(role) { return this.roles.includes(role) },
    /** 权限判定：管理员直通；其余看 scopes（细粒度）。 */
    hasPerm(perm) {
      if (!perm) return true
      if (this.isAdmin) return true
      if (this.scopes.includes('*')) return true
      return this.scopes.includes(perm)
    }
  }
})
