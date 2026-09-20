import { describe, expect, it, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAuthStore } from '@/stores/auth'
import { routes } from '@/router'
import { portalNav } from '@/router/nav'
import { resolveAccess, navHint } from '@/router/access'
import { translate, messages } from '@/i18n'

describe('身份与权限（auth store）', () => {
  beforeEach(() => { setActivePinia(createPinia()); localStorage.clear() })

  it('未登录时 loggedIn=false', () => {
    expect(useAuthStore().loggedIn).toBe(false)
  })

  it('登录后按 scopes 判权限；管理员直通', () => {
    const auth = useAuthStore()
    auth.apply({ token: 't', user: { name: 'a' }, roles: ['org_member'], scopes: ['card:read'] })
    expect(auth.hasPerm('card:read')).toBe(true)
    expect(auth.hasPerm('system:user:list')).toBe(false)
    expect(auth.hasPerm(null)).toBe(true)

    auth.apply({ token: 't2', roles: ['platform_admin'], scopes: [] })
    expect(auth.hasPerm('system:user:list')).toBe(true)
  })

  it('/me 的 {user:{roles,scopes}} 形状也要被识别（刷新后不能变无权限）', () => {
    const auth = useAuthStore()
    auth.apply({ user: { id: 1, name: '管理员', roles: ['platform_admin'], scopes: ['*'], tenant: 'GeoNexus', deptId: 1000 },
      token: 'jwt' })
    expect(auth.roles).toEqual(['platform_admin'])
    expect(auth.scopes).toEqual(['*'])
    expect(auth.hasPerm('system:user:list')).toBe(true)
    expect(auth.tenant).toBe('GeoNexus')
    expect(auth.deptId).toBe(1000)
  })

  it('顶层 claims 形状同样可用（RuoYi JWT）', () => {
    const auth = useAuthStore()
    auth.apply({ token: 'jwt2', user: { name: 'x' }, claims: { roles: ['org_member'], scopes: ['card:read'] } })
    expect(auth.hasPerm('card:read')).toBe(true)
    expect(auth.hasPerm('system:user:list')).toBe(false)
  })

  it('logout 清空令牌与角色', () => {
    const auth = useAuthStore()
    auth.apply({ token: 't', roles: ['org_member'], scopes: ['card:read'] })
    auth.logout()
    expect(auth.loggedIn).toBe(false)
    expect(auth.roles).toEqual([])
    expect(localStorage.getItem('gnx.token')).toBeNull()
  })
})

describe('访问模型：游客可看 / 登录可用 / 授权才能管', () => {
  const byName = Object.fromEntries(routes.filter((r) => r.name).map((r) => [r.name, r]))

  // 这是本轮问题的回归闸门：浏览型页面一旦被标成需要登录，整站都会弹登录页
  const MUST_BE_PUBLIC = [
    'earth-home', 'map', 'geocards', 'cases',
    'portal-home', 'visual-earth', 'global-cases', 'data-resources', 'operator-models',
    'compute-platform', 'open-community', 'super-agent', 'typical-apps',
    'login', 'register', 'forbidden'
  ]

  it('每条具名路由都显式声明 access', () => {
    for (const r of routes.filter((x) => x.name)) {
      expect(['public', 'auth', 'perm'], r.name).toContain(r.meta?.access)
    }
  })

  it('所有浏览型页面都是 public（游客不被拦）', () => {
    for (const name of MUST_BE_PUBLIC) expect(byName[name]?.meta.access, name).toBe('public')
  })

  it('只有工作台/个人中心需要登录，只有后台管理需要权限', () => {
    const gated = routes.filter((r) => r.meta?.access && r.meta.access !== 'public').map((r) => r.name).sort()
    expect(gated).toEqual(['account', 'admin', 'workbench'])
    expect(byName.workbench.meta.access).toBe('auth')
    expect(byName.account.meta.access).toBe('auth')
    expect(byName.admin.meta.access).toBe('perm')
    expect(byName.admin.meta.perm).toBe('system:user:list')
  })

  it('resolveAccess：游客放行 public、拦住 auth、登录后按 scopes 判 perm', () => {
    const anon = { loggedIn: false, hasPerm: () => false }
    const member = { loggedIn: true, hasPerm: (p) => p === 'card:read' }
    const admin = { loggedIn: true, hasPerm: () => true }

    expect(resolveAccess({ meta: { access: 'public' } }, anon).ok).toBe(true)
    expect(resolveAccess({ meta: { access: 'auth' }, fullPath: '/workbench' }, anon))
      .toMatchObject({ ok: false, reason: 'login', redirect: '/workbench' })
    expect(resolveAccess({ meta: { access: 'auth' } }, member).ok).toBe(true)
    expect(resolveAccess({ meta: { access: 'perm', perm: 'system:user:list' } }, member))
      .toMatchObject({ ok: false, reason: 'forbidden', need: 'system:user:list' })
    expect(resolveAccess({ meta: { access: 'perm', perm: 'system:user:list' } }, admin).ok).toBe(true)
    // 没声明 access 的路由按 public 处理（宁可放行浏览，也不要误拦）
    expect(resolveAccess({ meta: {} }, anon).ok).toBe(true)
  })

  it('侧栏/贴片导航的角标只提示、不隐藏', () => {
    const anon = { loggedIn: false, hasPerm: () => false }
    expect(navHint({ access: 'public' }, anon)).toBe('')
    expect(navHint({ access: 'auth' }, anon)).toBe('login')
    expect(navHint({ access: 'perm', perm: 'x' }, anon)).toBe('login')
    const member = { loggedIn: true, hasPerm: () => false }
    expect(navHint({ access: 'perm', perm: 'x' }, member)).toBe('forbidden')
    expect(navHint({ access: 'auth' }, member)).toBe('')
  })
})

describe('路由与导航的一致性', () => {
  const routeByName = Object.fromEntries(routes.filter((r) => r.name).map((r) => [r.name, r]))
  const navItems = portalNav.flatMap((g) => g.items)

  it('侧栏每一项都指向存在的路由', () => {
    for (const it of navItems) expect(routeByName[it.name], it.name).toBeTruthy()
  })

  it('侧栏的 access/perm 必须与路由 meta 一致（防止两处漂移）', () => {
    for (const it of navItems) {
      expect(it.access ?? 'public', it.name).toEqual(routeByName[it.name].meta.access ?? 'public')
      expect(it.perm ?? null, it.name).toEqual(routeByName[it.name].meta.perm ?? null)
    }
  })

  it('每个路由都声明了壳与标题键', () => {
    for (const r of routes.filter((x) => x.name)) {
      expect(['portal', 'earth', 'blank']).toContain(r.meta.shell)
      if (r.name !== 'forbidden') expect(r.meta.titleKey).toBeTruthy()
    }
  })

  it('perm 档的路由必须给出具体权限名', () => {
    for (const r of routes.filter((x) => x.name && x.meta?.access === 'perm')) {
      expect(r.meta.perm, r.name).toBeTruthy()
    }
  })
})

describe('i18n', () => {
  it('中英键集合一致（缺键会退回中文，但不应静默缺）', () => {
    const zh = Object.keys(messages.zh).sort()
    const en = Object.keys(messages.en).sort()
    expect(en.filter((k) => !zh.includes(k))).toEqual([])
    expect(zh.filter((k) => !en.includes(k))).toEqual([])
  })
  it('未知语言退回中文', () => {
    expect(translate('fr', 'nav.home')).toBe(messages.zh['nav.home'])
  })
})
