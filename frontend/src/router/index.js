import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

/** 路由即产品信息架构：
 *  shell=portal 走浅色门户壳（公众/机构），shell=earth 走深色玻璃地球系统壳（作业），
 *  perm 声明进入该页所需权限，由守卫统一判定（RBAC 的最小可用形态）。 */
/** 每条路由都必须显式声明 meta.access（见 router/access.js）。
 *  未声明时按 public 处理：宁可放行浏览，也不要把游客拦在登录页 —— 这是本轮修正的核心。 */
export const routes = [
  // ── 九模块（对齐参照站的组织；shell: 'app' 是统一壳：顶部导航 + 全宽内容）──
  { path: '/', name: 'home', component: () => import('@/views/app/HomeView.vue'),
    meta: { shell: 'app', access: 'public', titleKey: 'nav.home' } },
  { path: '/map', name: 'map', component: () => import('@/views/app/MapView.vue'),
    meta: { shell: 'app', access: 'public', titleKey: 'nav.map' } },
  { path: '/data', name: 'data', component: () => import('@/views/app/DataView.vue'),
    meta: { shell: 'app', access: 'public', titleKey: 'nav.data' } },
  { path: '/operators', name: 'operators', component: () => import('@/views/app/OperatorsView.vue'),
    meta: { shell: 'app', access: 'public', titleKey: 'nav.operators' } },
  { path: '/compute', name: 'compute', component: () => import('@/views/app/ComputeView.vue'),
    meta: { shell: 'app', access: 'public', titleKey: 'nav.compute' } },
  { path: '/community', name: 'community', component: () => import('@/views/app/CommunityView.vue'),
    meta: { shell: 'app', access: 'public', titleKey: 'nav.community' } },
  // 案例：左列表 + 右 dossier（对齐参照站），地图作为 dossier 里的内联卡片
  { path: '/cases', name: 'cases', component: () => import('@/views/app/CaseView.vue'),
    meta: { shell: 'app', access: 'public', titleKey: 'nav.cases' } },
  { path: '/workbench', name: 'workbench', component: () => import('@/views/earth/Workbench.vue'),
    meta: { shell: 'earth', access: 'auth', titleKey: 'nav.workbench' } },
  { path: '/account', name: 'account', component: () => import('@/views/earth/PersonalCenter.vue'),
    meta: { shell: 'earth', access: 'auth', titleKey: 'nav.account' } },
  { path: '/admin', name: 'admin', component: () => import('@/views/admin/AdminConsole.vue'),
    meta: { shell: 'portal', access: 'perm', perm: 'system:user:list', titleKey: 'nav.admin' } },

  // ── 旧地址重定向：改版不删地址（外链、书签、已发出的截图都不能断）──
  { path: '/portal', redirect: { name: 'home' } },
  { path: '/portal/earth', redirect: { name: 'map' } },
  { path: '/portal/data', redirect: { name: 'data' } },
  { path: '/portal/operators', redirect: { name: 'operators' } },
  { path: '/portal/compute', redirect: { name: 'compute' } },
  { path: '/portal/community', redirect: { name: 'community' } },
  { path: '/portal/cases', redirect: { name: 'cases' } },
  { path: '/portal/apps', redirect: { name: 'cases' } },
  { path: '/portal/agent', redirect: { name: 'workbench' } },
  { path: '/geocards', redirect: { name: 'data' } },
  { path: '/earth-home', redirect: { name: 'home' } },

  { path: '/login', name: 'login', component: () => import('@/views/auth/Login.vue'),
    meta: { shell: 'blank', access: 'public', titleKey: 'auth.login' } },
  { path: '/register', name: 'register', component: () => import('@/views/auth/Register.vue'),
    meta: { shell: 'blank', access: 'public', titleKey: 'auth.register' } },
  { path: '/403', name: 'forbidden', component: () => import('@/views/Forbidden.vue'),
    meta: { shell: 'blank', access: 'public' } },
  { path: '/:pathMatch(.*)*', redirect: '/' }
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 })
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()
  // 会话还原必须发生在任何判定之前（否则刷新时会先判成未登录/无权限）
  if (!auth.ready) await auth.restore()
  // 开发期演示入口：?demo=1 公众账号 / ?demo=admin 种子管理员（生产构建无此分支）
  const demo = to.query.demo
  if (import.meta.env.DEV && demo && !auth.loggedIn) await auth.applyDemoSession(String(demo))
  // 刻意**不做重定向**：游客浏览门户、地图、目录与案例不应被打断。
  // 需要登录/权限的页面由 App.vue 里的 AccessGate 就地给出引导（URL 与上下文都保留）。
  return true
})

export default router
