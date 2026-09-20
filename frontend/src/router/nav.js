/** 侧边导航与访问声明集中在此：路由 meta 里的 access/perm 必须与这里一致（有单测钉住）。
 *  注意 access 只决定"能否直接使用"，不决定"是否可见" —— 游客看得到全部入口，
 *  点进去由 AccessGate 说明原因，而不是把入口藏起来。 */
export const portalNav = [
  {
    title: '全球门户',
    items: [
      { name: 'portal-home', key: 'portal.home', access: 'public' },
      { name: 'visual-earth', key: 'portal.visualEarth', access: 'public' },
      { name: 'global-cases', key: 'portal.globalCases', access: 'public' },
      { name: 'data-resources', key: 'portal.dataResources', access: 'public' },
      { name: 'operator-models', key: 'portal.operatorModels', access: 'public' },
      { name: 'compute-platform', key: 'portal.computePlatform', access: 'public' },
      { name: 'open-community', key: 'portal.openCommunity', access: 'public' },
      { name: 'super-agent', key: 'portal.superAgent', access: 'public' },
      { name: 'typical-apps', key: 'portal.typicalApps', access: 'public' }
    ]
  },
  {
    title: '莫干地球系统',
    items: [
      { name: 'earth-home', key: 'nav.home', access: 'public' },
      { name: 'map', key: 'nav.map', access: 'public' },
      { name: 'geocards', key: 'nav.geocards', access: 'public' },
      { name: 'cases', key: 'nav.cases', access: 'public' },
      { name: 'workbench', key: 'nav.workbench', access: 'auth' },
      { name: 'account', key: 'nav.account', access: 'auth' }
    ]
  },
  {
    title: '管理',
    items: [{ name: 'admin', key: 'nav.admin', access: 'perm', perm: 'system:user:list' }]
  }
]
