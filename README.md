# GeoNexus Platform

> ☕ Java 管"管"，🐍 Python 管"算" — 联邦地理空间智能网络完整平台

GeoNexus Platform 是 GeoNexus 的完整应用层，包含 Java 管理后台、Python 执行面、
Node.js 门户、GeoNode Runtime 服务及全部文档和部署配置。

**依赖 SDK**: `geonexus-sdk>=1.0.0`（从 PyPI 安装，或指向本地 `../core`）

---

## 快速开始

### 前置条件

| 依赖 | 版本 | 说明 |
|------|------|------|
| JDK | 17 | `setup.sh` 可自动装（Homebrew / Adoptium） |
| Maven | 3.8+ | `setup.sh` 可自动装 |
| Python | 3.10+ | `geonexus-sdk` 要求 ≥3.10 |
| Node.js | 18+ | 仅 Node 门户（`server.js`）需要；用到 `node:sqlite` |

> ⚠️ **`dev.sh` 过去依赖仓库内自带的 `.jdk17/`、`.maven/`、`.venv-py39/`、
> `tmp/m2-repo/`。这些二进制已移出仓库**（曾把 585 MB 带进 git 历史）。
> 现在 `dev.sh` 会按"仓库内自带 → 系统安装 → 明确报错"的顺序解析工具链，
> 所以干净检出也能跑；先用 `./dev.sh doctor` 看它到底认到了什么。

### 环境配置

```bash
./setup.sh          # 装 JDK 17 + Maven + venv + geonexus-sdk + 执行面依赖
                    #   macOS 优先走 Homebrew；没有 brew 时直下 Adoptium（需要 sudo）
./dev.sh doctor     # 确认工具链解析结果（建议第一次先跑这个）
```

已经有 JDK 17 / Maven / Python 3.10+ 的机器可以跳过 `setup.sh`，手工建环境即可：

```bash
python3 -m venv .venv-py312
.venv-py312/bin/pip install "geonexus-sdk[mcp]>=1.0.0"   # 已在 PyPI 上（1.0.0）
.venv-py312/bin/pip install -e geonexus-execution-plane/
```

### 一键启动

```bash
./dev.sh all        # Python 执行面 (:8787) + Java mgbackend (:8080)

# 单独启动 / 其他
./dev.sh python     # 只起 GeoMCP 节点 :8787
./dev.sh java       # 只起 Java 管理后台 :8080
./dev.sh test       # 运行两端全部测试
./dev.sh stop       # 停止 dev.sh 启动的进程
./dev.sh doctor     # 只看工具链解析结果
```

**想要整套 Python 侧（GeoMCP + Registry + Web BFF）**，直接用执行面的统一入口
（它内嵌 Registry 并把 12 个内建技能自动注册进去）：

```bash
.venv-py312/bin/geonexus-execution-plane
# GeoMCP :8787 · Registry :8790 · Web BFF :8900
```

### 验证管算分离真的通了

```bash
curl http://127.0.0.1:8787/health                       # Python 计算面
curl http://localhost:8080/mogan/geocard/list           # Java 管理面
curl http://localhost:8080/mogan/geocard/execution-plane/capabilities   # Java → Python

# 真正算一遍 NDVI：Java 控制面驱动 Python 计算面
curl -s -X POST http://localhost:8080/mogan/geocard/execute/ndvi \
  -H 'Content-Type: application/json' \
  -d '{"red":"geonexus-web/output/synthetic_red_2025.tif",
       "nir":"geonexus-web/output/synthetic_nir_2025.tif",
       "output":"/tmp/geonexus-exec/ndvi_2025.tif"}'
# → {"status":"ok","skill":"ndvi-analysis","outputs":{"ndvi_raster":"...",
#    "stats":{"mean":0.3178,"std":0.1463,"pixels":25600}}}
```

---

## 架构

```text
┌─────────────────────────────────────────────┐
│  ☕ Java 控制面 (mgbackend :8080)            │
│  GeoCard CRUD · 审核流转 · OGE 凭证 · 审计   │
│  GeoMCPClient ───────────────────────────┐  │
└──────────────────────────────────────────│──┘
                                           │ GeoMCP JSON-RPC 2.0
┌──────────────────────────────────────────│──┐
│  🐍 Python 计算面 (:8787)                 │  │
│  NDVI / 变化检测 / 地形 / 缓冲区 等 12 技能 │  │
│  GAAG 契约门禁 · OGE Adapter · Registry ◄─┘  │
└─────────────────────────────────────────────┘
        ▲
        │ HTTP
┌───────┴─────────────────────────────────────┐
│  🌐 Node 门户 (server.js :3100)              │
│  Node 联邦视图 · 知识图谱 · 任务 · 资产       │
└─────────────────────────────────────────────┘
```

数据主权原则：**数据留在原处，计算移动到数据**。Java 侧只做管理与编排，
所有栅格/矢量计算都在 Python 计算面完成。

### 服务端点

| 服务 | 地址 | 说明 |
|------|------|------|
| 🌐 Node 门户 | http://127.0.0.1:3100/ | 联邦节点视图 / 两张图谱 / 资产 |
| 🧭 能力图谱 | http://127.0.0.1:3100/capability-graph | 平台自身的能力依赖图（旧路径 `/graph` 仍可用） |
| 🌍 地理知识 | http://127.0.0.1:3100/geo-knowledge | **GeoKG 地理领域知识图谱**（检索 + 邻域 + 溯源） |
| ☕ Java 管理端首页 | http://localhost:8080/ | GeoCard / OGE / NDVI 执行 |
| 📋 数据治理门户 | http://localhost:8080/portal.html | 数据源与治理视图 |
| 🔧 工作流 | http://localhost:8080/workflow.html | 流程编排视图 |
| ☕ REST API | http://localhost:8080/mogan/ | 全部 API |
| 🐍 执行面（GeoMCP） | http://127.0.0.1:8787/health | GeoMCP Server |
| 📚 Registry | http://127.0.0.1:8790/nodes | 节点/卡片/技能视图（可选） |
| 🔌 Web BFF | http://127.0.0.1:8900/docs | JWT + 异步任务 + SSE（可选） |
| 📊 H2 控制台 | http://localhost:8080/h2-console | `jdbc:h2:mem:geonexus_mg`，用户 `sa`，空密码 |

### 两张图谱别混淆

门户里有两个图，画的**不是同一件事**：

| 页面 | 画的是 | 数据来源 |
|------|--------|----------|
| `/capability-graph` **能力图谱** | 平台**自身**的能力网络：GeoNode / GeoMCP / GeoCard / GeoSkill / 政策之间的 `depends-on`、`wraps`、`presents` | 门户自带的 `data/geonexus.db`（`relations` 表） |
| `/geo-knowledge` **地理知识** | GeoKG 那份**地理领域知识**：国家、SDG 指标、卫星、灾害/气候/土地覆盖本体、术语 | 独立的 GeoKG 服务（`:8788`），经门户同源代理 |

> 第二个标签页以前叫 "GeoKG" 却画的是第一张图，名不副实，已改名并新增页。

**地理知识页需要 GeoKG 在跑**。它没起时页面会显示一条明确的离线提示（含启动命令），
不会白屏。门户通过 `/api/geokg/*` **反向代理**到 `:8788`——因为 GeoKG 没有配
CORS，浏览器不能跨端口直连。代理**只放行只读 GET**，写接口（manifest / refresh /
build）不经过门户：

```bash
# 门户侧的代理白名单（server.js）
/version /health /types /search /graph /entity/…
# 上游地址可覆盖
GEOKG_URL=http://127.0.0.1:8788 node server.js
```

### Java mgbackend API

**GeoCard**（`/mogan/geocard`）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/list` | GeoCard 列表 |
| GET | `/search?keyword=&assetType=&region=` | 全文搜索 |
| GET | `/{id}` | 单个 GeoCard |
| POST | `` | 创建草稿 |
| PUT | `/{id}` | 更新 |
| DELETE | `/{id}` | 删除 |
| POST | `/{id}/submit` | 提交审核（draft→pending） |
| POST | `/{id}/approve` | 审核通过（pending→approved） |
| POST | `/{id}/reject` | 驳回 |

**执行（Java → Python）**

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/mogan/geocard/execution-plane/health` | 查询执行面健康 |
| GET | `/mogan/geocard/execution-plane/capabilities` | 查询执行面技能/工具清单 |
| POST | `/mogan/geocard/execute/ndvi` | 执行 NDVI |
| POST | `/mogan/geocard/execute/ndvi-change` | NDVI 变化检测 |

**OGE 凭证**（`/mogan/oge/credential`）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/list` | 凭证列表 |
| GET | `/{id}` | 单个凭证 |
| POST | `` | 创建/更新凭证 |
| DELETE | `/{id}` | 删除凭证 |
| POST | `/{id}/validate` | 校验凭证有效性 |
| POST | `/{id}/sync` | 下发凭证到执行面 |

**Agent**（`/mogan/agent`）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/health` | Agent 健康 |
| POST | `/discover` | 发现可用技能/节点 |
| POST | `/bind` | 绑定数据与技能 |

### Python 执行面端点

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/health` | 健康检查 |
| GET | `/capabilities` | 能力列表（含 12 个内建技能） |
| POST | `/geomcp` | GeoMCP JSON-RPC 分发（`geo.capabilities` / `geo.describe` / `geo.execute` / `geo.health`） |

技能：`ndvi-analysis`、`ndvi-change`、`terrain-slope`、`terrain-aspect`、
`ndwi-analysis`、`evi-analysis`、`ndbi-analysis`、`buffer-analysis`、
`zonal-stats`、`reproject`、`clip-crop`、`composite-bands`。

---

## 与另外两个仓库组成本地栈

三个仓库可以拼成一个完整可测的本地栈，各自独立、通过 HTTP 相连：

| 仓库 | 进程 | 端口 |
|------|------|------|
| `GeoNexus-SDK` | 执行面 / Registry / Web BFF | 8787 / 8790 / 8900 |
| **`GeoNexus-Platform`**（本仓库） | Java mgbackend / Node 门户 | 8080 / 3100 |
| `GeoKG` | 知识图谱管理面 | 8788 |

Java 管理端只通过 HTTP 访问执行面（`geonexus.execution-plane.url`，默认
`http://127.0.0.1:8787`，可用 `GEONEXUS_EXECUTION_PLANE_URL` 覆盖）。

---

## 项目结构

```
├── server.js + index.html + app.js + styles.css   # Node 门户（:3100）
│   └── server.js 含 /api/geokg/* → GeoKG :8788 的同源只读代理
├── scripts/check_portal.mjs           # 门户前端静态检查（无依赖，dev.sh test 会跑）
│
├── geonexus-execution-plane/          # Python 执行面（计算面）
│   ├── src/geonexus_execution_plane/
│   │   ├── main.py                    # ExecutionPlane：一键起 GeoMCP+Registry+Web
│   │   ├── handlers.py                # NDVI/变化检测真实 handler (rasterio+numpy)
│   │   ├── extended_handlers.py       # 地形/水体/指数/矢量等扩展 handler
│   │   ├── skills.py                  # 12 个内建技能
│   │   ├── oge_adapter.py             # OGE 算子 → Skill/GeoCard 适配
│   │   └── agent_router.py            # Agent 路由
│   └── tests/                         # 28 个测试全部通过
│
├── mgbackend/                         # Java 管理后台 (RuoYi 风格)
│   ├── src/main/java/com/geonexus/mgbackend/
│   │   ├── client/GeoMCPClient.java            # GeoMCP JSON-RPC 客户端
│   │   ├── controller/GeoCardController.java   # GeoCard CRUD + 审核 + 执行
│   │   ├── controller/OgeCredentialController.java  # OGE 凭证管理
│   │   ├── controller/AgentController.java     # Agent 发现/绑定
│   │   ├── service/GeoCardService.java         # 审核流转
│   │   └── service/GeoExecutionService.java    # 驱动 Python 计算
│   ├── src/main/resources/static/              # index / portal / workflow 三个前端页
│   ├── src/main/resources/schema.sql           # H2/PostgreSQL DDL
│   └── src/test/                               # 12 个测试全部通过
│
├── services/geonode-runtime/          # FastAPI GeoNode Runtime（Docker）
├── geonexus-web/                      # Vue3 + Cesium 参考前端
├── docs/                              # 架构设计、实施方案、协议文档
├── manifests/                         # GeoNode/GeoSkill 清单
├── infra/                             # Docker Compose (PostGIS/Redis/MinIO)
├── dev.sh                             # 一键启动脚本（含工具链自检）
└── setup.sh                           # 开发环境安装脚本
```

---

## 测试

```bash
./dev.sh test        # 两端全部测试
```

| 模块 | 测试数 | 状态 |
|------|--------|------|
| Python 执行面（handlers / skills / OGE） | 28 | ✅ |
| Java GeoMCPClient (WireMock) | 7 | ✅ |
| Java GeoCardController | 3 | ✅ |
| Java OgeCredentialController | 2 | ✅ |
| **合计** | **40** | **全部通过** |

---

## 文档

| 文档 | 说明 |
|------|------|
| `docs/platform-architecture.md` | **架构总览（心脏/大脑/手脚/资源）**：四系统定位、集成主链路、身份与权限设计（含架构图） |
| `docs/user-management.md` | **用户管理设计**：账号模型/注册/认证令牌/三段式权限/个人中心/后台管理（含模块图与验收判据） |
| `docs/completeness-assessment.md` | **完成度评估（基于代码实测）**：逐层矩阵、五个关键缺口、可复现命令 |
| `frontend/README.md` | **新前端（Vue3 + Vite）**：两个壳（门户浅色 / 莫干深色玻璃）、信息架构、运行与测试 |
| `docs/architecture-diagrams.md` | 架构图（管算分离 / OGE 交互 / 契约职责） |
| `docs/ruoyi-integration-protocol.md` | Java ↔ Python 通信协议 |
| `docs/python-blackbox-plan.md` | Python 执行面黑盒化方案 |
| `docs/implementation-plan.md` | 完整实施方案 |
| `docs/implementation-roadmap.md` | 开发路线图 |
| `docs/product-architecture.md` | 产品架构模型 |

---

## 前端（Vue3 + Vite）

`frontend/` 是按目标架构重写的前端，替代根目录的单文件 Node 门户（`server.js` 保留为 API/BFF）：

| 壳 | 视觉 | 模块 |
|---|---|---|
| 门户 | 浅色 | 门户首页 · 可视化地球 · 全球案例 · 数据资源 · 算子模型 · 算力平台 · 开放社区 · 超级智能体 · 典型应用 · 后台管理 |
| 莫干地球系统 | 深色玻璃（对齐 `mogan-digital-earth` 参考件） | 首页 · 地图 · GeoCard · 案例中心 · 智能工作台 · 个人中心 |

```bash
# 本机 npm 全局指向 node v9 的旧 npm（5.6），必须显式用 nvm 里的 node 22：
export PATH="$HOME/.nvm/versions/node/v22.22.1/bin:$PATH"
cd frontend
npm install            # .npmrc 已把 cache 固定到 /tmp/npmcache（~/.npm 不可写）
npm run dev            # http://127.0.0.1:5173 ，/api 反代到 VITE_API_TARGET（默认 127.0.0.1:3100）
npm test && npm run build
```

> 后端 BFF 默认 **3100**，但如果该端口被别的进程占用（本机实测被 DSH Desktop 占用），
> `server.js` 会自动顺延到 **3101** —— 此时前端要用
> `VITE_API_TARGET=http://127.0.0.1:3101 npm run dev`。

### SDK 打通

`/api/sdk/geocards` 由 BFF 代理到 **SDK Registry**（`REGISTRY_URL`，默认 `127.0.0.1:8790`），
把 GeoCard 归一化后给前端；连不上时前端回退到平台本地目录、再回退演示数据，并在界面标注来源。

## License

Apache 2.0
