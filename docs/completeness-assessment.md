# GeoNexus-Platform 完成度评估（基于代码实测）

> 评估方法：**只以代码与可运行结果为依据**，不采信文档自述。
> 复现命令见第八节。评估时间：与 `docs/platform-architecture.md` / `user-management.md` 同一轮。
> 定位基准：Platform ＝ 手脚/躯体（RuoYi 前后端），包裹心脏（SDK）与大脑（GeoKG），
> 把心脏能力长成产品（门户 + 莫干地球系统）；身份/注册/权限/审计在这一层。

---

> **进展更新（本轮）**：新增 `frontend/`（Vue3 + Vite）：门户浅色壳 + 莫干深色玻璃壳、
> 15 条路由、RBAC 守卫与 scopes 判定、MapLibre 地图与 GeoCard 图层、
> `/api/sdk/geocards` 已真实代理到 SDK Registry（实测拿到 `sentinel-2-amazon`）、
> 13 项单测通过 + 前端 CI。下表为**新增前端之前**的实测结论，保留作基线对照。

## 一、结论（一句话）

**当前平台是一个"能力目录 + 任务 + 图谱"的 Node/SQLite 管理演示门户，而不是目标架构里的
"RuoYi 手脚层"。** 门户前端与演示链路**可用**，但三个关键落点尚未开工：

1. **身份权威不在这一层**（Java 侧完全无鉴权，Node 侧却有一套自建用户系统）；
2. **RuoYi 尚未落地**（无依赖、无 `sys_*` 表）；
3. **与心脏（SDK）没有打通**（`/api/geomcp/*` 是本地 SQLite 模拟，任务系统也是自建）。

| 维度 | 完成度 | 一句话依据 |
|---|---|---|
| 门户前端（框架 + 信息展示） | **~55%** | 8 路由 SPA、4,856 行，能力图谱/地理知识可用；但信息架构与计划的 门户 8 + 莫干 6 不一致 |
| 身份与权限（本层核心职责） | **~15%** | Node 有可用的注册/登录/会话；**Java 侧 0**（`permitAll`）；无角色/组织/菜单/数据范围 |
| 后台管理系统（计划 2.6） | **~5%** | `/admin` 仅 `setRouteMode('admin')`；无用户/角色/菜单/审批/配额界面 |
| 莫干地球系统业务（2.1–2.5） | **~25%** | GeoCard 有雏形、工作台有 plan/jobs；案例中心、个人中心缺失 |
| 与心脏 SDK 集成 | **~10%** | 仅 GeoKG 只读代理是真集成；GeoMCP 注册/发现写本地 SQLite |
| 与 OGE 集成 | **~40%** | Java 有凭证管理、执行面有 `oge_adapter`；下发与回调链路未联通验证 |
| 工程化（测试/CI） | **~30%** | Java 12 用例、执行面 28 用例全过；**前端 0 用例，平台仓库无 CI** |

---

## 二、代码规模与可运行证据

| 组件 | 文件 | 行数 | 状态 | 证据 |
|---|---|---|---|---|
| Node 门户（`server.js`/`app.js`/`index.html`/`styles.css`） | 4 | 4,856 | 可运行 | 与 monorepo 根同名文件**逐字节相同**；8 路由 |
| `mgbackend`（Java） | 17 main + 3 test | 1,207（main） | 骨架可用 | `target/surefire-reports`：**12 用例全过**（0.0 失败） |
| `geonexus-execution-plane`（vendored Python） | 9 个 `.py` | 2,293 | 可运行 | **28 用例全过**（pytest 退出码 0）；12 个 GeoSkill |
| `geonexus-web`（vendored 演示栈） | 11 | 669 | 演示级 | `backend/demo_stack.py` + 单页前端 |
| `scripts/` | 9 | 3,003 | —— | **主要是文档/PPT 生成器**（最大者 971 行 implementation-plan 生成器）+ `check_portal.mjs` |
| `infra/` `services/` `manifests/` | 22 | ~1,000 | 骨架 | 2 个 docker-compose（phase1）、1 个 GeoNode manifest |
| `docs/` | 15 md + 4 docx | —— | 丰富 | 含本轮新增的架构与用户管理设计 |

**门户自建 15 张 SQLite 表**：`nodes` `capabilities` `data_products` `users` `sessions`
`asset_cards` `relations` `tasks` `jobs` `job_events` `postcard_templates`
`stamp_groups` `stamps` `postmark_groups` `postmarks`。

---

## 三、逐层完成度（对照架构五层）

### ① 访问层（门户前端）
- ✅ 8 个路由可用：`/` Overview · `/tasks` · `/capabilities` · `/data-products` ·
  `/capability-graph` 能力图谱 · `/geo-knowledge` 地理知识 · `/runtime` · `/admin`
- ✅ 有图谱渲染（`renderGraph`）、任务详情（`renderTaskDetail`）、规划时间线（`renderTimeline`）
- ❌ **没有地图/地球可视化**（计划 2.1 首页要求"图层管理/工具集"；门户要求"可视化地球"）
- ❌ 无明信片/邮戳以外的"开放社区"社区能力（`stamps`/`postmarks` 是纪念戳类互动功能）

### ② 身份与权限（本层最该有、当前最缺）
| 项 | Java `mgbackend` | Node 门户 | 目标架构要求 |
|---|---|---|---|
| 登录/注册 | ❌ 无 | ✅ `/api/auth/register|login|me` | RuoYi 统一登录 |
| 口令存储 | —— | ✅ PBKDF2-SHA256 12 万轮 + salt | ✔（可参考） |
| 会话/令牌 | ❌ 无（pom 有 jjwt 但无过滤器） | ✅ `sessions` 表 + Bearer `gnx_…` | RS256 JWT + JWKS |
| 鉴权开关 | ❌ **`permitAll()`**（`SecurityConfig` 注释自认"生产需启用 JWT 过滤器"） | ✅ `requireAuth()` 仅部分接口 | 功能/数据/配额三段 |
| 角色/组织/菜单 | ❌ 无表、无接口 | ❌ 无 | `sys_role`/`sys_dept`/`sys_menu` |
| 数据范围→资产可见性 | ❌ 无 | ⚠️ 仅 `ownerUserId` 外键 | 投影到 GeoCard `visibility/tenant/owner` |

### ③ 业务服务
| 计划细分内容 | 现状 | 差距 |
|---|---|---|
| 2.1 首页 | ⚠️ `/` Overview 是能力/统计总览 | 缺图层管理、工具集、四个智能体入口 |
| 2.2 GeoCard | ⚠️ `buildGeoCard()` 自产卡片 + `/api/geocards` + Java `GeoCardController` | **不经 SDK 契约校验**，两处各自造卡 |
| 2.3 案例中心 | ❌ | 无案例库/分类/详情；`/data-products` 是数据产品不是案例 |
| 2.4 智能工作台 | ⚠️ `/api/plan` `/api/jobs` + 时间线渲染 | 无 Agent 编排联动（Java 有 `AgentController`，未接前端） |
| 2.5 个人中心 | ❌ | 只有 `/api/auth/me`；无"我的任务/资产/案例/配额/审计"页 |
| 2.6 运维管理（后台管理系统） | ❌ | `/admin` 仅路由占位；无用户/角色/菜单/审批/看板 |

### ④ 集成与审计
- ✅ **GeoKG 只读代理**：`/api/geokg/*` 白名单 + 405/403 + 友好报错（真实可用，本轮之前的成果）
- ❌ **与 SDK 未打通**：`server.js` 中搜不到 `8787`/`8790`/`8900`；
  `/api/geomcp/register|discover` 实际调用 `saveAssetCard()/saveDataProduct()` **写本地 SQLite**
- ❌ **任务系统自建**：`tasks`/`jobs`/`job_events` 三张表 —— 这是 SDK `GEOTASK.md` 明确要收口的
  "第四套任务概念"，与 GeoTask 重复
- ⚠️ 审计：Java 有 `mogan_audit` 表；Node 侧无审计表；两处未互联

### ⑤ 资源层对接（OGE / GeoNode）
- ✅ Java：`OgeCredentialController` + `OgeCredentialService` + `mogan_oge_credential`（加密存储）
- ✅ 执行面：`oge_adapter.py`（OGE 调用与轮询）
- ❌ 凭证"下发 → 换 tk → 回调回写"整条链路**未联通验证**（`ruoyi-integration-protocol.md` 定义了，代码未闭环）
- ⚠️ `manifests/geonode-mekong.yaml` + `services/geonode-runtime` 是本地节点骨架

---

## 四、五个关键缺口（按影响排序）

### 1. 身份权威错位（最严重）
目标架构：**Platform/RuoYi 是唯一身份权威**。
现实：**Java 完全放开**（`SecurityConfig` 全部 `permitAll`），而**Node 门户自建了一套用户系统**
（`users`/`sessions` 表 + PBKDF2 + Bearer 会话）。
→ 若同时上线，将出现**两张用户表**，正是 `user-management.md` 第 1 条红线要禁止的情形。
→ 处置：Node 这套**作为参考实现**迁到 RuoYi（口令存储与登录流程可复用），
**不能两套并行**；迁移期以 RuoYi 为准，Node 侧只留会话转发。

### 2. RuoYi 尚未落地
`pom.xml` 无 RuoYi 依赖；`schema.sql` 只有 3 张业务表（`mogan_geocard`/`mogan_oge_credential`/`mogan_audit`），
**没有 `sys_user`/`sys_role`/`sys_menu`/`sys_dept`**。README 自称"RuoYi 风格"（措辞成立），
但"基于 RuoYi 开发"仍是计划而非现状。

### 3. 与心脏（SDK）没有打通
- 门户不调用 SDK 的 GeoNode/Registry（无端口/客户端引用）
- `/api/geomcp/register|discover` 是**本地模拟**（自产 geoCard、不校验 Schema）
- 门户另建 `tasks/jobs/job_events`，与 SDK `GeoTask` 重复
→ 结果：**"手脚"目前没有长在"心脏"上**，而是自带一套简化版器官。

### 4. 前端信息架构与计划不一致
现有 8 路由 ≠ 计划表要求的 **门户 8 项 + 莫干 6 项**。缺：案例中心、个人中心、运维管理（后台）、
可视化地球、全球案例、算力平台、开放社区、超级智能体、典型应用。

### 5. 工程化缺口
- **平台仓库无 `.github/workflows`**（monorepo 的 `java.yml`/`python.yml` 覆盖 `mgbackend/**` 与执行面）
- **前端 0 测试**（无 JS 测试框架；`check_portal.mjs` 只做静态一致性检查）
- `geonexus-execution-plane/`、`geonexus-web/` 是 **vendored 副本**（与 monorepo 逐文件相同）→ 漂移风险
- 门户依赖 `node:sqlite` → **需 Node ≥ 22**（本机 `node` 一度不可用即因此）

---

## 五、已经可用、应当保留的资产

| 资产 | 为什么值得保留 |
|---|---|
| 门户 SPA 骨架（8 路由 + 图谱/列表/详情渲染） | 前端框架与组件可直接演进到"门户 8 + 莫干 6"的 IA |
| Node 侧 auth 实现（PBKDF2 + 会话 + `requireAuth`） | 迁移到 RuoYi 时的**参考实现**（口令策略/会话失效可对照） |
| GeoKG 只读代理（白名单 + 405/403 + 友好报错） | 已是"手脚接大脑"的正确姿势（只读、最小暴露） |
| Java 管理面骨架（GeoCard CRUD / OGE 凭证 / Agent / GeoMCP 客户端 / H2+PG） | 三个控制器 + 四个服务即后台管理系统的雏形 |
| 执行面 12 个 GeoSkill + 28 个测试 | 真实可算能力（NDVI/变化检测/地形/NDWI/EVI/NDBI/缓冲/分区统计/重投影/裁剪/合成） |
| `check_portal.mjs` | 门户静态一致性闸门，可扩成前端 CI |

---

## 六、建议的下一步（映射到 12 周计划）

| 周次 | 动作 | 可验收判据 |
|---|---|---|
| W1–W2 | ① 身份权威定案：引入 RuoYi 系统表；② 迁 Node auth（保留实现、改权威）；③ 平台仓库建 CI（Java + 执行面 + 前端静态检查） | `sys_user` 可登录；Node 不再自建账号；CI 在 PR 上跑起来 |
| W3–W4 | ① 门户 IA 对齐（门户 8 + 莫干 6 的页面骨架）；② `mgbackend` 加权限注解与数据范围；③ **GeoCard 目录改接 SDK Registry**（废弃本地自产卡片） | 目录数据来自 SDK；越权返回 404 |
| W5–W6 | ① 用户/组织/角色/菜单管理界面（RuoYi 扩展菜单）；② 审批 + 配额 + 运营看板；③ 案例中心、个人中心首版 | 10.31 前"全部功能开发完成"可演示 |
| W7–W8 | 打通 GeoMCP：门户任务/作业**改为调用 SDK GeoTask**，删除自建 `tasks/jobs`；联调 + 内测 | 任务状态与 SDK 一致；11.15 前内测通过 |
| W9–W11 | OGE 凭证下发→换 tk→回调闭环联调；部署上线 + 试运行 | 12.6 前上线并试运行 |
| W12 | 验收移交 | 12.13 |

---

## 七、风险

1. **两套账号表并存**：一旦 Node 与 RuoYi 同时对外，权限与审计会出现两套口径 —— 必须"迁移"，不能"并行"。
2. **Vendored 副本漂移**：执行面/web 是副本，SDK 侧更新后不同步 → 建议改为子模块或包依赖，而非复制。
3. **自建任务系统与技术债**：门户 `tasks/jobs` 越用越深，后期改接 GeoTask 的代价越大 → 越早越好。
4. **前端 IA 返工**：现有路由与计划 IA 不同，越晚对齐返工越多。

---

## 八、评估方法与复现命令

```bash
# Java 测试（需 mvn；本机无 mvn，可读上次 surefire 报告）
grep -h "Tests run" mgbackend/target/surefire-reports/*.txt    # → 7 + 3 + 2 = 12，0 失败

# 执行面测试（28 用例）
cd geonexus-execution-plane && PYTHONPATH=src python -m pytest tests -q   # 退出码 0

# 鉴权现状
grep -n "permitAll\|JWT 过滤器" mgbackend/src/main/java/com/geonexus/mgbackend/config/SecurityConfig.java

# RuoYi 是否落地
grep -c ruoyi mgbackend/pom.xml ; grep -o "CREATE TABLE IF NOT EXISTS [a-z_]*" mgbackend/src/main/resources/schema.sql

# 门户是否连 SDK
grep -nE "8787|8790|8900" server.js        # 无输出 = 未连接

# 门户信息架构
grep -oE 'data-route="[^"]*"' index.html | sort -u
```
