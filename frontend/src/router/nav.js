/** 侧边导航与权限声明集中在此：路由 meta 里也有 perm，两者必须一致（有单测钉住）。 */
export const portalNav = [
  {
    title: '全球门户',
    items: [
      { name: 'portal-home', key: 'portal.home', perm: null },
      { name: 'visual-earth', key: 'portal.visualEarth', perm: null },
      { name: 'global-cases', key: 'portal.globalCases', perm: null },
      { name: 'data-resources', key: 'portal.dataResources', perm: 'card:read' },
      { name: 'operator-models', key: 'portal.operatorModels', perm: 'card:read' },
      { name: 'compute-platform', key: 'portal.computePlatform', perm: null },
      { name: 'open-community', key: 'portal.openCommunity', perm: null },
      { name: 'super-agent', key: 'portal.superAgent', perm: null },
      { name: 'typical-apps', key: 'portal.typicalApps', perm: null }
    ]
  },
  {
    title: '莫干地球系统',
    items: [
      { name: 'earth-home', key: 'nav.home', perm: 'earth:view' },
      { name: 'map', key: 'nav.map', perm: 'earth:view' },
      { name: 'geocards', key: 'nav.geocards', perm: 'card:read' },
      { name: 'cases', key: 'nav.cases', perm: 'case:read' },
      { name: 'workbench', key: 'nav.workbench', perm: 'workbench:run' },
      { name: 'account', key: 'nav.account', perm: null }
    ]
  },
  {
    title: '管理',
    items: [{ name: 'admin', key: 'nav.admin', perm: 'system:user:list' }]
  }
]
