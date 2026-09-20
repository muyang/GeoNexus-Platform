/** 访问模型（与架构图 / user-management.md / UI 文档一致）：
 *
 *   public  游客即可 —— 浏览门户、资讯、地图与简单 WebGIS、目录与案例
 *   auth    登录可用 —— 复杂空间分析、计算、模拟（工作台）与个人中心
 *   perm    授权才能管 —— 后台管理、发布资产等；登录了但没 scopes 仍是拒绝
 *
 *  判定放进纯函数，便于单测钉住"哪些页面不能被登录拦住"——这类回归一旦发生，
 *  表现就是"整站都被弹到登录页"，很难在开发中察觉（实测踩过）。 */

export const ACCESS = Object.freeze({ PUBLIC: 'public', AUTH: 'auth', PERM: 'perm' });

export const REASON = Object.freeze({ LOGIN: 'login', FORBIDDEN: 'forbidden' });

/**
 * @param {{ meta?: { access?: string, perm?: string|null }, fullPath?: string }} route
 * @param {{ loggedIn: boolean, hasPerm: (perm?: string|null) => boolean }} auth
 * @returns {{ ok: true } | { ok: false, reason: string, need?: string, redirect?: string }}
 */
export function resolveAccess(route, auth) {
  const access = route?.meta?.access || ACCESS.PUBLIC;
  if (access === ACCESS.PUBLIC) return { ok: true };
  if (!auth?.loggedIn) {
    return { ok: false, reason: REASON.LOGIN, redirect: route?.fullPath || '/' };
  }
  if (access === ACCESS.PERM) {
    const need = route?.meta?.perm || null;
    if (need && !auth.hasPerm(need)) return { ok: false, reason: REASON.FORBIDDEN, need };
  }
  return { ok: true };
}

/** 侧栏/贴片导航的角标：告诉游客"点这个会要登录/要权限"，而不是把它藏起来。 */
export function navHint(item, auth) {
  const access = item?.access || ACCESS.PUBLIC;
  if (access === ACCESS.PUBLIC) return '';
  if (!auth?.loggedIn) return 'login';
  if (access === ACCESS.PERM && item?.perm && !auth.hasPerm(item.perm)) return 'forbidden';
  return '';
}
