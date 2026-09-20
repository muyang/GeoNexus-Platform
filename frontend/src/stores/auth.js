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
      // 兼容三种形状：顶层 claims、payload 顶层字段、以及 /me 的 {user:{roles,scopes}}
      // （漏掉第三种会导致"刷新后变无权限"——构建产物里实测踩到过）
      const claims = payload.claims || payload.user?.claims || {}
      this.roles = payload.roles || claims.roles || payload.user?.roles || this.roles
      this.scopes = payload.scopes || claims.scopes || payload.user?.scopes || this.scopes
      this.tenant = payload.tenant ?? claims.tenant ?? payload.user?.tenant ?? this.tenant
      this.deptId = payload.deptId ?? claims.deptId ?? payload.user?.deptId ?? this.deptId
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
      if (this.ready) return
      if (this._restoring) return this._restoring          // 幂等：并发调用共享同一次请求
      this._restoring = (async () => {
        await this._doRestore()
        this.ready = true
        this._restoring = null
      })()
      return this._restoring
    },
    async _doRestore() {
      if (!this.token) return
      try {
        const me = await authApi.me()
        this.apply({ user: me.user, token: me.token || this.token, ...me })
      } catch {
        this.logout()
      }
    },
    /** 仅开发期演示入口（生产构建里 DEV 为 false，不会带上）。
     *  优先用真实后端注册/登录 demo 账号 —— 这样演示态的权限是真的、可审计的；
     *  后端不可达时才退回纯离线身份，并在界面标注。 */
    async applyDemoSession(asAdmin = false) {
      // ?demo=admin：用 Java/RuoYi 侧种子管理员真实登录（身份权威在 Java）；
      // ?demo=1：用公众演示账号，先注册后登录
      const email = asAdmin ? (import.meta.env.VITE_DEMO_ADMIN_EMAIL || 'admin') : 'demo@local'
      const password = asAdmin ? (import.meta.env.VITE_DEMO_ADMIN_PASSWORD || 'Admin@GeoNexus2026') : 'demo-password-123'
      if (asAdmin) {
        try { await this.login(email, password); return } catch { /* 落回离线身份 */ }
      }
      try {
        try {
          await this.login(email, password)
        } catch {
          await this.register({ name: '演示账号', email, password, org: 'GeoNexus · 演示' })
        }
      } catch {
        this.apply({
          token: 'demo-session-offline',
          user: { id: 'demo', name: '演示账号（离线）', email, org: 'GeoNexus · 离线演示', offline: true },
          roles: ['platform_admin'],
          scopes: ['*']
        })
      }
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
