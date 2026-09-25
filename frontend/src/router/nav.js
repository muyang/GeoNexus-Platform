/** 平台导航：**一套**九模块（对齐参照站 http://116.62.181.80:8793/ 的组织方式）。
 *
 *  改版前的教训：这里曾经有三组 16 项（全球门户 9 个模块 + 莫干地球系统 6 个页面 + 管理），
 *  同一件事出现两次（global-cases 与 cases、data-resources 与 geocards、visual-earth 与 map），
 *  用户要在两套壳之间来回切 —— 这就是"页面组织混乱"的根源。现在只有一份清单。
 *
 *  `access` 只决定"能否直接使用"，不决定"是否可见"：游客看得到全部入口，
 *  点进去由 AccessGate 说明原因，而不是把入口藏起来（见 router/access.js）。
 */
export const navModules = [
  { name: 'home', key: 'nav.home', access: 'public' },
  { name: 'map', key: 'nav.map', access: 'public' },
  { name: 'data', key: 'nav.data', access: 'public' },
  { name: 'operators', key: 'nav.operators', access: 'public' },
  { name: 'compute', key: 'nav.compute', access: 'public' },
  { name: 'cases', key: 'nav.cases', access: 'public' },
  { name: 'workbench', key: 'nav.workbench', access: 'auth' },
  { name: 'community', key: 'nav.community', access: 'public' },
  { name: 'account', key: 'nav.account', access: 'auth' }
]

/** 后台管理不进主导航（只对管理员可见），但仍参与"导航 ↔ 路由"一致性检查。 */
export const navAdmin = [
  { name: 'admin', key: 'nav.admin', access: 'perm', perm: 'system:user:list' }
]

/** 兼容旧的调用点：保留分组形状，但**只有一组**（渲染出来就是一条平的导航）。 */
export const portalNav = [{ title: '平台', items: [...navModules, ...navAdmin] }]

export const allNavItems = [...navModules, ...navAdmin]
