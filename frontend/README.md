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
npm run dev          # http://127.0.0.1:5173 ，/api 反代到后端（默认 127.0.0.1:3100）
npm run build        # 产出 dist/
npm test             # vitest
```

后端地址可用 `VITE_API_TARGET` 覆盖（指向 RuoYi/Java 时无需改前端代码）。

## 底图

在线底图，无需密钥：

- 深色（莫干）：CARTO dark-matter
- 浅色（门户可视化地球）：CARTO positron

可用 `VITE_BASEMAP_DARK` / `VITE_BASEMAP_LIGHT` 换成天地图等；加载失败时地图页会明确提示而不是空白。
