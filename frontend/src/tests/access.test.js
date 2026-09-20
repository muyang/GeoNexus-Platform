import { describe, expect, it, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAuthStore } from '@/stores/auth'
import { routes } from '@/router'
import { portalNav } from '@/router/nav'
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

  it('logout 清空令牌与角色', () => {
    const auth = useAuthStore()
    auth.apply({ token: 't', roles: ['org_member'], scopes: ['card:read'] })
    auth.logout()
    expect(auth.loggedIn).toBe(false)
    expect(auth.roles).toEqual([])
    expect(localStorage.getItem('gnx.token')).toBeNull()
  })
})

describe('路由与导航的一致性', () => {
  const routeByName = Object.fromEntries(routes.filter((r) => r.name).map((r) => [r.name, r]))
  const navItems = portalNav.flatMap((g) => g.items)

  it('侧栏每一项都指向存在的路由', () => {
    for (const it of navItems) expect(routeByName[it.name], it.name).toBeTruthy()
  })

  it('侧栏的 perm 必须与路由 meta.perm 一致（防止两处漂移）', () => {
    for (const it of navItems) expect(it.perm ?? null, it.name).toEqual(routeByName[it.name].meta.perm ?? null)
  })

  it('每个路由都声明了壳与标题键', () => {
    for (const r of routes.filter((x) => x.name)) {
      expect(['portal', 'earth', 'blank']).toContain(r.meta.shell)
      if (r.name !== 'forbidden') expect(r.meta.titleKey).toBeTruthy()
    }
  })

  it('受保护页面都声明了所需权限或显式置空', () => {
    for (const r of routes.filter((x) => x.name && !x.meta.public && x.meta.shell !== 'blank')) {
      expect('perm' in r.meta).toBe(true)
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
