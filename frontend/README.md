# GeoNexus-Platform 前端（Vue3 + Vite）

两个壳、两套视觉，一套路由与权限：

| 壳 | 视觉 | 面向 | 模块 |
|---|---|---|---|
| **门户**（门户/管理） | 浅色（沿用既有门户令牌） | 公众 / 机构用户 | 首页 · 可视化地球 · 全球案例 · 数据资源 · 算子模型 · 算力平台 · 开放社区 · 超级智能体 · 典型应用 |
| **莫干地球系统** | 深色玻璃（对齐 `mogan-digital-earth` 参考件） | 作业人员 | 首页 · 地图 · GeoCard · 案例中心 · 智能工作台 · 个人中心 · 后台管理 |

## 运行

```bash
# 本机 node 需要 ≥ 20（node:sqlite 由后端用到；前端只需 ≥ 18）
export PATH="$HOME/.nvm/versions/node/v22.22.1/bin:$PATH"
npm install          # .npmrc 已把 cache 固定到 /tmp/npmcache
npm run dev          # http://127.0.0.1:5173 ，/api 反代到后端（默认 127.0.0.1:3301）
npm run build        # 产出 dist/
npm test             # vitest
```

后端地址可用 `VITE_API_TARGET` 覆盖（指向 RuoYi/Java 时无需改前端代码）。

## 访问模型（新增页面时必读）

三档，声明在路由 `meta.access` 上（`src/router/access.js` 判定，纯函数有单测）：

```js
meta: { shell: 'portal', access: 'public', titleKey: 'portal.home' }        // 游客可看（默认）
meta: { shell: 'earth',  access: 'auth',   titleKey: 'nav.workbench' }      // 登录可用
meta: { shell: 'portal', access: 'perm', perm: 'system:user:list', ... }    // 授权才能管
```

- **不要在守卫里重定向**：需要登录/权限时由 `AccessGate` 就地引导，保留 URL 与上下文；
  整站弹登录页是明确禁止的回归（`src/tests/access.test.js` 里有一份"必须 public 的路由清单"钉住它）。
- **导航不隐藏入口**：侧栏（`router/nav.js`）与贴片导航对游客显示全部条目，只打 `需登录`/`需权限` 角标。
- **能看 ≠ 能做**：页面可以 public，但里面的动作按需再判（例如案例中心可浏览，`一键复跑` 需登录）。

## 底图（矢量 + 栅格，可切换）

地图页顶栏有底图切换器（也支持深链 `?basemap=`）：

| id | 说明 | 源 |
|---|---|---|
| `dark-vector`（默认） | 深色矢量 | CARTO dark-matter style.json |
| `dark-raster` | 深色栅格（**兜底**，不依赖矢量瓦片） | CARTO `dark_all` 栅格瓦片 |
| `satellite` | 卫星影像 | Esri World Imagery |
| `light-vector` | 浅色矢量 | CARTO positron style.json |

设计取舍：矢量好看但依赖 WebGL 与 style/sprite/glyphs 可达；**栅格用于弱环境兜底**。
瓦片错误会单独计数并显示在顶栏（偶发缺瓦片不该整体判死），只有底图源不可用或 8s 超时才切到本地空样式
并给出明确提示 —— 同时 GeoCard 图层继续可见，另有"定位到数据"按钮一键缩放到数据范围。
无 WebGL 时会直接说明，而不是给一块黑屏。

### 地图验证的边界（重要）

本仓库的自动化验证能证明：MapLibre 初始化成功（DOM 里有 canvas 与控件）、样式加载完成
（界面显示 `map ready`）、GeoCard 图层真的加进地图（DOM 断言 `data-map-layers="1"`）、
瓦片链路可达（`200 / 293KB / application/x-protobuf / access-control-allow-origin: *`）。

**但无头 Chrome（SwiftShader）不合成 WebGL canvas**，截图里地图区域始终是纯背景色 —— 这是
截图环境的限制，不是地图不可用。真机浏览器打开即可看到瓦片；若你那边也是空白，请把顶栏的
"瓦片错误 N"数字与 Console 报错发我。
