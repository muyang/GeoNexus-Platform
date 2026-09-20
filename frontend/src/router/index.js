import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

/** 路由即产品信息架构：
 *  shell=portal 走浅色门户壳（公众/机构），shell=earth 走深色玻璃地球系统壳（作业），
 *  perm 声明进入该页所需权限，由守卫统一判定（RBAC 的最小可用形态）。 */
export const routes = [
  { path: '/', name: 'earth-home', component: () => import('@/views/earth/EarthHome.vue'),
    meta: { shell: 'earth', perm: 'earth:view', titleKey: 'nav.home' } },
  { path: '/map', name: 'map', component: () => import('@/views/earth/MapWorkspace.vue'),
    meta: { shell: 'earth', perm: 'earth:view', titleKey: 'nav.map' } },
  { path: '/geocards', name: 'geocards', component: () => import('@/views/earth/GeoCards.vue'),
    meta: { shell: 'earth', perm: 'card:read', titleKey: 'nav.geocards' } },
  { path: '/cases', name: 'cases', component: () => import('@/views/earth/CaseCenter.vue'),
    meta: { shell: 'earth', perm: 'case:read', titleKey: 'nav.cases' } },
  { path: '/workbench', name: 'workbench', component: () => import('@/views/earth/Workbench.vue'),
    meta: { shell: 'earth', perm: 'workbench:run', titleKey: 'nav.workbench' } },
  { path: '/account', name: 'account', component: () => import('@/views/earth/PersonalCenter.vue'),
    meta: { shell: 'earth', perm: null, titleKey: 'nav.account' } },

  { path: '/portal', name: 'portal-home', component: () => import('@/views/portal/PortalHome.vue'),
    meta: { shell: 'portal', perm: null, titleKey: 'portal.home' } },
  { path: '/portal/earth', name: 'visual-earth', component: () => import('@/views/portal/VisualEarth.vue'),
    meta: { shell: 'portal', perm: null, titleKey: 'portal.visualEarth' } },
  { path: '/portal/cases', name: 'global-cases', component: () => import('@/views/portal/GlobalCases.vue'),
    meta: { shell: 'portal', perm: null, titleKey: 'portal.globalCases' } },
  { path: '/portal/data', name: 'data-resources', component: () => import('@/views/portal/DataResources.vue'),
    meta: { shell: 'portal', perm: 'card:read', titleKey: 'portal.dataResources' } },
  { path: '/portal/operators', name: 'operator-models', component: () => import('@/views/portal/OperatorModels.vue'),
    meta: { shell: 'portal', perm: 'card:read', titleKey: 'portal.operatorModels' } },
  { path: '/portal/compute', name: 'compute-platform', component: () => import('@/views/portal/ComputePlatform.vue'),
    meta: { shell: 'portal', perm: null, titleKey: 'portal.computePlatform' } },
  { path: '/portal/community', name: 'open-community', component: () => import('@/views/portal/OpenCommunity.vue'),
    meta: { shell: 'portal', perm: null, titleKey: 'portal.openCommunity' } },
  { path: '/portal/agent', name: 'super-agent', component: () => import('@/views/portal/SuperAgent.vue'),
    meta: { shell: 'portal', perm: null, titleKey: 'portal.superAgent' } },
  { path: '/portal/apps', name: 'typical-apps', component: () => import('@/views/portal/TypicalApps.vue'),
    meta: { shell: 'portal', perm: null, titleKey: 'portal.typicalApps' } },
  { path: '/admin', name: 'admin', component: () => import('@/views/admin/AdminConsole.vue'),
    meta: { shell: 'portal', perm: 'system:user:list', titleKey: 'nav.admin' } },

  { path: '/login', name: 'login', component: () => import('@/views/auth/Login.vue'),
    meta: { shell: 'blank', public: true, titleKey: 'auth.login' } },
  { path: '/register', name: 'register', component: () => import('@/views/auth/Register.vue'),
    meta: { shell: 'blank', public: true, titleKey: 'auth.register' } },
  { path: '/403', name: 'forbidden', component: () => import('@/views/Forbidden.vue'),
    meta: { shell: 'blank', public: true } },
  { path: '/:pathMatch(.*)*', redirect: '/' }
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 })
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()
  // 会话还原必须发生在权限判定之前：否则刷新受保护页面会先被判成无权限（实测踩到）
  if (!auth.ready) await auth.restore()
  // 开发期演示入口：?demo=1 直接以演示账号进入（生产构建无此分支）
  const demo = to.query.demo
  if (import.meta.env.DEV && demo && !auth.loggedIn) await auth.applyDemoSession(demo === 'admin')
  if (to.meta.public) return true
  if (!auth.loggedIn) return { name: 'login', query: { redirect: to.fullPath } }
  const perm = to.meta.perm
  if (perm && !auth.hasPerm(perm)) return { name: 'forbidden', query: { need: perm } }
  return true
})

export default router
