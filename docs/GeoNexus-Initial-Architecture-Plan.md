# GeoNexus 初步架构方案

> 基于《我想基于我们构想的GeoMCP.docx》中的设计构想与原型，结合现有 Phase 1 运行时，提出本初步架构方案。

---

## 1. 设计定位

**GeoNexus 是面向 GeoAI 的全球地理信息公共产品枢纽。**

它不再是以下载为中心的“数据门户”，而是一个**可执行、可编排、可协作**的地理空间智能网络：

- **资产即能力（Asset as a Capability）**：数据、模型、工具、知识等都以标准化 GeoMCP 接口发布，可被检索、组合、执行。
- **联邦式部署**：支持多机构节点（GeoNode）接入，数据主权和合规策略内置。
- **AI 优先的交互**：自然语言驱动任务编排，结果实时渲染在地图上。
- **社区生态**：类似 Hugging Face 的 Fork、版本、评分、协作机制。

---

## 2. 总体架构：一核四层

```text
┌─────────────────────────────────────────────────────────────────────┐
│                        场景应用层 (Solutions)                        │
│   EO 智能服务    SDGs 监测站    远程学习 / Paper Space    知识库     │
├─────────────────────────────────────────────────────────────────────┤
│                      编排与交互层 (Orchestration Studio)             │
│   ChatMap   │   Workflow Canvas   │   GeoHub   │   Copilot        │
├─────────────────────────────────────────────────────────────────────┤
│                       运行时环境层 (Runtime Spaces)                  │
│   Serverless GeoMCP Runner   │   GPU/TPU 集群   │   安全沙箱        │
├─────────────────────────────────────────────────────────────────────┤
│                        资产托管层 (Repository & Registry)            │
│   GeoData Hub   │   GeoModel Hub   │   GeoAgent Hub   │   GeoCard │
├─────────────────────────────────────────────────────────────────────┤
│                         核心层：GeoMCP Protocol Engine               │
│   统一资源/工具接口  │  元数据标准  │  发现/执行协议  │  策略审计  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 3. 核心层：GeoMCP Protocol Engine

GeoMCP 是整个平台的“通用语言”。所有资产必须通过 GeoMCP Adapter 封装后注册。

### 3.1 核心抽象

| 概念 | 说明 | 示例 |
|------|------|------|
| **Resource** | 可被引用但不一定被移动的数据/模型/文档 | Sentinel-2 L2A Mosaic, FloodGPT 权重 |
| **Tool** | 接收输入、执行计算、返回输出的函数单元 | NDVI 计算、淹没分析、变化检测 |
| **Agent** | 封装了 Prompt + 工具集 + 目标的智能体 | 森林火灾监测专员 |
| **Workflow** | 由 Resources 和 Tools 构成的有向无环图 | 洪水风险制图 DAG |
| **GeoCard** | 资产的元数据身份证 | 含 BBox、CRS、时间、主权等级、接口 Schema |

### 3.2 协议接口（建议基于 MCP + Geo 扩展）

```yaml
# GeoMCP Capability Manifest 示例
capability:
  id: "geonode://mekong/skill.flood-impact-analysis"
  type: GeoSkill
  name: "Flood Impact Analysis"
  provider: "Delta Resilience Lab"
  node: "mekong"
  interface:
    protocol: geostandard.mcp.geo
    version: "1.0"
  inputs:
    - name: region
      type: geojson/bbox
    - name: date_range
      type: datetime/range
    - name: water_extent_source
      type: resource/uri
  outputs:
    - name: flood_map
      type: raster/cog
    - name: affected_population
      type: table/csv
  policies:
    - sovereignty: asean-data-local
    - export: derived-output-only
  trust:
    level: verified
    validation: seed-node
```

### 3.3 适配器设计

```
外部资产
   │
   ├── Python 脚本      ──▶  GeoMCP Python SDK  ──▶  Tool Runner
   ├── ArcGIS/QGIS 插件 ──▶  Bridge Adapter      ──▶  Tool Runner
   ├── ONNX/PyTorch 模型 ──▶  Model Server      ──▶  Tool Runner
   └── 外部数据服务     ──▶  Resource Adapter   ──▶  Resource Registry
```

---

## 4. 资产托管层（Repository & Registry）

### 4.1 三层资产模型

| Hub | 功能 | 数据格式示例 |
|-----|------|-------------|
| **GeoData Hub** | 托管或索引地理数据 | COG, FlatGeobuf, Parquet, STAC |
| **GeoModel Hub** | 托管 GeoAI 模型、物理模型容器 | ONNX, PyTorch, HEC-RAS/SWMM Docker |
| **GeoAgent Hub** | 托管预定义 Agent | Agent Manifest + Prompt + ToolSet |

### 4.2 索引模式

支持两种数据托管策略：

- **全托管模式**：数据上传到 GeoNexus 对象存储（MinIO/S3）。
- **仅索引模式**：数据保留在提供者本地，平台只保存元数据引用和访问策略。

### 4.3 GeoCard 元数据

```json
{
  "id": "geonode://mekong/data.sentinel-2-l2a",
  "type": "GeoDataCapability",
  "geo_card": {
    "title": "Sentinel-2 L2A Mosaic",
    "provider": "ESA / Copernicus",
    "bbox": [100.0, 12.0, 108.0, 18.0],
    "crs": "EPSG:4326",
    "temporal_range": "2023-01-01/2025-12-31",
    "format": "COG",
    "sovereignty_level": "ASEAN-Public",
    "preview_url": "...",
    "schema": "..."
  }
}
```

---

## 5. 运行时环境层（Runtime Spaces）

运行时负责**实际执行** GeoMCP 工具、模型和工作流。

### 5.1 运行时组件

```text
┌─────────────────────────────────────────────────────────┐
│                    GeoNexus Runtime                      │
├─────────────────────────────────────────────────────────┤
│  API Gateway (FastAPI/Go)                                │
├───────────────┬─────────────────────┬─────────────────────┤
│  Skill Runner │   Model Server      │   Agent Worker      │
│  (Python)     │   (GPU/TPU)         │   (Temporal)        │
├───────────────┴─────────────────────┴─────────────────────┤
│  安全沙箱 (gVisor/Kata)  +  OPA 策略引擎                  │
├─────────────────────────────────────────────────────────┤
│  对象存储 (MinIO/S3)  │  矢量/栅格 DB (PostGIS/Rasterio)│
└─────────────────────────────────────────────────────────┘
```

### 5.2 执行模式

| 模式 | 适用场景 | 实现 |
|------|---------|------|
| **同步执行** | 轻量查询、元数据发现 | FastAPI 直接响应 |
| **异步任务** | 长时间计算、模型推理 | Temporal / Celery |
| **Serverless** | 用户上传的自定义脚本 | Knative / K8s Job |
| **GPU 推理** | 深度学习模型 | Ray Serve / Triton |

### 5.3 与现有 Phase 1 的衔接

现有 `services/geonode-runtime` 已具备：

- FastAPI 服务
- Temporal 工作流/工人
- PostGIS
- MinIO

后续演进路径：

1. 将 `skill.flood-impact-analysis` 抽象为 GeoSkill Capability 注册表。
2. 新增 `/capabilities` 端点，返回标准 GeoMCP manifest。
3. 新增 `/jobs` 异步执行接口，支持 Capability ID + 参数。
4. 将 Worker 升级为通用 GeoMCP Runner，支持动态加载 Docker 镜像/Python 脚本。

---

## 6. 编排与交互层（Orchestration Studio）

### 6.1 交互范式

| 模块 | 描述 | 对应原型 |
|------|------|---------|
| **ChatMap** | 左侧 AI 对话，右侧交互地图 | 南非洪水示例 |
| **Workflow Canvas** | 节点式 DAG 编排器 | 原型中的 Model Builder |
| **GeoHub** | 资产发现、搜索、排行榜 | 首页四大榜单 |
| **Active Task / Cart** | 选中的数据/工具形成任务上下文 | 左侧 Active Task 区域 |

### 6.2 AI 编排流程

```text
用户输入自然语言
        │
        ▼
┌───────────────────┐
│  Intent Parser    │  LLM 解析意图、提取时空范围、输出指标
└─────────┬─────────┘
          ▼
┌───────────────────┐
│  Capability       │  向量检索 + 元数据过滤，匹配 Data / Tool / Agent
│  Retriever        │
└─────────┬─────────┘
          ▼
┌───────────────────┐
│  Planner          │  生成 Workflow DAG，校验输入输出类型与策略
└─────────┬─────────┘
          ▼
┌───────────────────┐
│  Executor         │  分发到 Runtime，异步执行，返回状态/产物
└───────────────────┘
```

### 6.3 关键交互状态机

```
Idle -> IntentParsed -> CapabilitiesMatched -> WorkflowPlanned 
  -> Submitted -> Running -> Succeeded/Failed/Aborted
```

---

## 7. 场景应用层（Solutions）

基于下层能力，封装面向具体场景的门户。

| 场景 | 能力组合 | 用户 |
|------|---------|------|
| **EO 智能服务** | 卫星数据 + 目标检测/分割模型 + 时序分析 | 遥感机构、港口/农业部门 |
| **SDGs 监测评估** | 指标模型 + 区域数据 + 报告生成 | 政府、国际组织 |
| **远程学习 / 科研复现** | Paper Space + 预配置环境 + 交互地图 | 高校、科研机构 |
| **地理信息知识库** | RAG + 论文/报告索引 + 知识问答 | 研究人员、公众 |

---

## 8. 数据架构

### 8.1 数据流

```text
用户上传资产
    │
    ├── 原始数据 ──▶ 对象存储 (MinIO/S3)
    ├── 元数据    ──▶ 注册中心 (PostGIS + Elasticsearch/Milvus)
    ├── 索引      ──▶ STAC / COG / FlatGeobuf
    └── 策略      ──▶ OPA / Policy Registry

任务执行
    │
    ├── 输入参数   ──▶ Runtime API
    ├── 中间结果   ──▶ 对象存储 / PostGIS
    └── 输出产物   ──▶ 对象存储 + 元数据回写
```

### 8.2 关键数据存储

| 数据类型 | 存储 | 理由 |
|---------|------|------|
| 元数据/注册表 | PostgreSQL + PostGIS | 空间查询、JSON Schema |
| 矢量/栅格索引 | PostGIS / STAC | 空间检索、Catalog |
| 向量检索 | Milvus / pgvector | Capability 语义搜索 |
| 对象存储 | MinIO / S3 | COG、模型权重、产物 |
| 缓存/消息 | Redis | 会话、任务状态、限流 |
| 执行日志/审计 | ClickHouse / S3 Parquet | 大规模审计、可追溯 |

---

## 9. 安全与主权

### 9.1 主权围栏（Sovereignty Fence）

```text
┌─────────────────────────────────────┐
│  数据 / 工具 / 节点                  │
│   ├── 主权标签 (CN-Public, US-Secret)│
│   ├── 数据驻留策略                   │
│   ├── 导出策略 (原始/衍生/禁止)      │
│   └── 访问控制 (RBAC + ABAC)         │
└─────────────────────────────────────┘
              │
              ▼
        OPA / Open Policy Agent
              │
              ▼
        执行前合规校验：类型匹配 + 策略兼容 + 信任等级
```

### 9.2 安全机制

- **安全沙箱**：gVisor/Kata 容器运行用户上传代码。
- **零信任网络**：节点间 mTLS 通信，能力调用需鉴权。
- **审计日志**：每次 Capability 调用记录请求、参数、输出、策略检查结果。
- **数据脱敏**：敏感数据预览时坐标抖动、水印覆盖。

---

## 10. 部署架构

### 10.1 逻辑部署视图

```text
                        Internet
                           │
                    ┌──────┴──────┐
                    │   CDN/WAF    │
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
        ┌─────┴────┐ ┌─────┴────┐ ┌─────┴────┐
        │  Web App  │ │  API GW  │ │  MCP GW  │
        │  (Next.js)│ │ (FastAPI)│ │ (Go/Envoy)│
        └─────┬─────┘ └─────┬─────┘ └─────┬─────┘
              │             │             │
              └─────────────┼─────────────┘
                            │
              ┌─────────────┴─────────────┐
              │   GeoNexus Control Plane   │
              │  Registry / Planner / Auth  │
              └─────────────┬─────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
   ┌────┴────┐        ┌────┴────┐        ┌────┴────┐
   │ GeoNode │◄──────►│ GeoNode │◄──────►│ GeoNode │
   │  Mekong │        │  Africa │        │  Global │
   └─────────┘        └─────────┘        └─────────┘
```

### 10.2 物理组件映射（Phase 1 → Phase 2 → Phase 3）

| 阶段 | 新增组件 | 目标 |
|------|---------|------|
| **Phase 1**（现有） | geonode-runtime, Temporal, PostGIS, MinIO | 验证单节点 Capability 执行契约 |
| **Phase 2** | 注册中心、向量检索、AI Planner、Web Studio | 资产发现、编排、社区 |
| **Phase 3** | 多 GeoNode 联邦、Agent Swarm、策略市场 | 跨节点协作、自主代理 |

---

## 11. 技术栈建议

| 层次 | 技术 | 说明 |
|------|------|------|
| 前端 | Next.js 14 + Tailwind + shadcn/ui | SSR/SEO、组件化 |
| 地图 | CesiumJS / Mapbox GL / Leaflet | 3D、矢量、轻量底图 |
| 后端 API | FastAPI (Python) + Go Gateway | Python 生态 + 高性能网关 |
| 协议 | GeoMCP (MCP + Geo 扩展) | 发现、执行、上下文 |
| 数据库 | PostgreSQL + PostGIS + pgvector | 元数据、空间、语义检索 |
| 对象存储 | MinIO | 兼容 S3，可私有化部署 |
| 调度 | Temporal + Kubernetes | 异步工作流、弹性伸缩 |
| 分布式计算 | Ray / Dask | 大规模并行计算 |
| 安全 | OPA + OAuth2/OIDC + mTLS | 策略、鉴权、传输安全 |

---

## 12. 实施路线图

### Phase 1：基石构建（0-3 个月）

目标：稳定单节点 Capability 执行契约。

- 完善 `geonode-runtime` 的 GeoMCP 接口（`/capabilities`, `/jobs`, `/jobs/{id}`）。
- 将 `skill.flood-impact-analysis` 封装为标准 GeoSkill。
- 接入真实数据/计算流程（如 Sentinel-2 索引、NDVI、洪水淹没分析）。
- 部署 Docker Compose 开发环境。

### Phase 2：生态连接（3-6 个月）

目标：资产发现、编排、社区。

- 构建 Capability Registry + 向量检索。
- 开发 Web Studio 原型（ChatMap + Workflow Canvas）。
- 支持用户上传 Python 脚本自动转 GeoMCP Tool。
- 接入 Google Earth Engine、Sentinel Hub 等外部数据源适配器。
- 上线 OPA 策略市场。

### Phase 3：全球大脑（6-12 个月）

目标：跨节点自主协作。

- 多 GeoNode 联邦：节点发现、能力路由、策略协商。
- Agent Swarm：多 Agent 自主协作。
- 社区经济：信誉/积分、算力市场。
- 全球 GeoAI 开发者联盟与生态运营。

---

## 13. 关键决策与待确认事项

| 序号 | 决策点 | 建议 | 待确认 |
|------|--------|------|--------|
| 1 | 协议基础 | 以 MCP 1.0 为基线，扩展 GeoMCP | 是否需自定义传输层？ |
| 2 | 部署形态 | 中心平台 + 联邦节点 | 是否支持纯私有化部署？ |
| 3 | 算力模式 | 平台托管 + 用户自有集群 | 计费模式？ |
| 4 | 模型托管 | 容器镜像 + 模型仓库 | 是否支持 HuggingFace 模型直接引用？ |
| 5 | 数据合规 | OPA + 主权标签 | 各国数据分级标准如何落地？ |
| 6 | 社区治理 | 信誉 + 评审 | 是否引入链上存证？ |

---

## 14. 原型到实现的映射

| 原型元素 | 实现组件 | 当前状态 |
|---------|---------|---------|
| 左侧导航 / Active Task | Web Studio Sidebar + Task Cart | 未开始 |
| 首页四大榜单 | GeoHub Discovery | 未开始 |
| AI 对话框 / Copilot | ChatMap + Planner Service | 未开始 |
| 数据页面 | GeoData Hub + STAC Catalog | 未开始 |
| 工具箱 | GeoSkill Registry | 部分具备（flood-impact-analysis） |
| 模拟器 / Model Builder | Workflow Canvas + Temporal | 部分具备（Temporal 工人） |
| 案例库 | Case Study CMS | 未开始 |
| 多语言 | i18n 框架 | 原型已有基础 |
| 主权状态指示器 | OPA Policy UI | 未开始 |
| 南非洪水场景 | 演示 Workflow | 可作为 Phase 1 验证用例 |

---

## 15. 下一步行动建议

1. **冻结 GeoMCP 1.0 协议草案**：明确 Resource / Tool / Agent / Workflow 的 Schema。
2. **扩展 `geonode-runtime`**：将现有 `/jobs` 接口升级为通用 Capability 执行器。
3. **选择并接入真实数据源**：例如 GEE / Sentinel Hub / STAC API，作为第一个 GeoData Capability。
4. **启动 Web Studio 原型**：以 Next.js + Tailwind 复刻 docx 中的 v13 原型。
5. **定义 OPA 策略库**：至少覆盖数据驻留、导出控制、信任等级三条策略。

---

*文档版本：v0.1*  
*更新日期：2026-06-27*
