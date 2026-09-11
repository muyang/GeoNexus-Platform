# GeoNexus Platform

> ☕ Java 管"管"，🐍 Python 管"算" — 联邦地理空间智能网络完整平台

GeoNexus Platform 是 GeoNexus 的完整应用层，包含 Java 管理后台、Python 执行面、
Node.js 控制台、GeoNode Runtime 服务及全部文档和部署配置。

**依赖 SDK**: `geonexus-sdk>=1.0.0`（从 PyPI 安装）

---

## 快速开始

### 一键启动

```bash
# 启动全部服务（Python 执行面 + Java mgbackend）
./dev.sh all

# 单独启动
./dev.sh python    # :8787 执行面
./dev.sh java      # :8080 管理后台
./dev.sh test      # 运行全部测试
./dev.sh stop      # 停止所有服务
```

### 环境配置

```bash
export JAVA_HOME=$(/usr/libexec/java_home -v17)
export PATH="$JAVA_HOME/bin:$PATH"
pip install "geonexus-sdk>=1.0.0"
```

---

## 架构

```text
┌───────────────────────────────────┐
│  ☕ Java 控制面 (mgbackend :8080)  │
│  GeoCard CRUD · OGE 凭证 · 审计   │
│  GeoMCPClient ──────────────────┐ │
└─────────────────────────────────│─┘
                                  │ GeoMCP JSON-RPC 2.0
┌─────────────────────────────────│─┐
│  🐍 Python 计算面 (:8787)       │ │
│  NDVI handler · GAAG · OGE     │ │
└─────────────────────────────────┘ │
```

### 服务端点

| 服务 | 地址 | 说明 |
|------|------|------|
| 🌐 管理后台前端 | http://localhost:8080/ | GeoCard / OGE / NDVI 执行 |
| ☕ REST API | http://localhost:8080/mogan/ | 全部 API |
| 🐍 执行面 | http://127.0.0.1:8787/health | GeoMCP Server |
| 📊 H2 控制台 | http://localhost:8080/h2-console | 数据库调试 |

### Java mgbackend API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/mogan/geocard/list` | GeoCard 列表 |
| GET | `/mogan/geocard/search?keyword=&assetType=&region=` | 全文搜索 |
| POST | `/mogan/geocard` | 创建草稿 |
| POST | `/mogan/geocard/{id}/submit` | 提交审核 (draft→pending) |
| POST | `/mogan/geocard/{id}/approve` | 审核通过 (pending→approved) |
| POST | `/mogan/geocard/execute/ndvi` | 执行 NDVI（Java→Python） |
| POST | `/mogan/geocard/execute/ndvi-change` | 变化检测 |
| GET | `/mogan/geocard/execution-plane/health` | 查询执行面健康 |
| GET | `/mogan/oge/credential/list` | OGE 凭证列表 |
| POST | `/mogan/oge/credential` | 创建/更新凭证 |
| POST | `/mogan/oge/credential/{id}/sync` | 下发凭证到执行面 |
| DELETE | `/mogan/oge/credential/{id}` | 删除凭证 |

### Python 执行面端点

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/health` | 健康检查 |
| GET | `/capabilities` | 能力列表 |
| POST | `/geomcp` | GeoMCP JSON-RPC 分发 |

---

## 项目结构

```
├── geonexus-execution-plane/     # Python 执行面
│   ├── src/handlers.py           # NDVI/变化检测真实 handler (rasterio+numpy)
│   ├── src/skills.py             # 4 个内建技能
│   ├── src/main.py               # 核心编排器
│   └── tests/                    # 20 个测试全部通过
│
├── mgbackend/                    # Java 管理后台 (RuoYi 风格)
│   ├── src/main/java/.../
│   │   ├── client/GeoMCPClient.java    # 200 行 GeoMCP 客户端
│   │   ├── controller/GeoCardController.java  # GeoCard CRUD + 审核
│   │   ├── controller/OgeCredentialController.java  # OGE 凭证管理
│   │   ├── service/GeoCardService.java    # 审核流转
│   │   └── service/GeoExecutionService.java  # 驱动 Python 计算
│   ├── src/main/resources/static/index.html  # 管理后台前端
│   ├── src/main/resources/schema.sql         # H2/PostgreSQL DDL
│   └── src/test/                  # 12 个测试全部通过
│
├── server.js + index.html        # Node.js 控制台
├── services/geonode-runtime/     # FastAPI GeoNode Runtime
├── geonexus-web/                 # Vue3 + Cesium 参考前端
├── docs/                         # 架构设计、实施方案、协议文档
├── manifests/                    # GeoNode/GeoSkill 清单
├── infra/                        # Docker Compose (PostGIS/Redis/MinIO)
├── dev.sh                        # 一键启动脚本
└── setup.sh                      # 开发环境安装脚本
```

---

## 测试

```bash
# 一键运行全部测试
./dev.sh test
```

| 模块 | 测试数 | 状态 |
|------|--------|------|
| Python handlers (NDVI/change) | 20 | ✅ |
| Java GeoMCPClient (WireMock) | 7 | ✅ |
| Java GeoCardController | 3 | ✅ |
| Java OgeCredentialController | 2 | ✅ |
| **合计** | **32** | **全部通过** |

---

## 文档

| 文档 | 说明 |
|------|------|
| `docs/architecture-diagrams.md` | 架构图（管算分离 / OGE 交互 / 契约职责） |
| `docs/ruoyi-integration-protocol.md` | Java ↔ Python 通信协议 |
| `docs/python-blackbox-plan.md` | Python 执行面黑盒化方案 |
| `docs/implementation-plan.md` | 完整实施方案 |
| `docs/implementation-roadmap.md` | 开发路线图 |
| `docs/product-architecture.md` | 产品架构模型 |

---

## License

Apache 2.0