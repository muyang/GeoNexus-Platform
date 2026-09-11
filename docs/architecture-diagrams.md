# GeoNexus 后台架构图（Mermaid）

> 已确认的架构决策（v2）：
> 1. **Java 管"管"，Python 管"算"**：Java mgbackend（RuoYi）是管理面，Python 执行面是计算面。
> 2. **OGE 由 Python 统一调用**：OGE 是 Python 执行面的一个远程 adapter，Java 不直连 OGE 执行链路。
> 3. **契约归 Java 仓库拥有**：`geonexus-contracts/` 由 Java 团队维护；Python 团队通过 SDK 的 `tests/conformance/` 保证实现正确，两边 CI 各自独立验证，集成时对齐。

## 1. 总体架构图

```mermaid
graph TB
    subgraph Frontend["🖥️ 前端层"]
        Admin["管理后台<br/>RuoYi-Vue3<br/>运营/管理员 CRUD"]
        Portal["门户前端<br/>Vue3 + Cesium<br/>最终用户 · 自然语言对话"]
    end

    subgraph JavaCP["☕ Java 控制面 · mgbackend（RuoYi + PostgreSQL）"]
        subgraph BizModules["控制面 7 模块"]
            GeoCardM["GeoCard 资产管理"]
            GeoNodeM["GeoNode 节点管理"]
            GeoMcpM["GeoMCP 端点管理"]
            GeoSkillM["GeoSkill 技能管理"]
            AgentCfg["GeoAgentConfig LLM 配置"]
            QuotaM["Quota 配额管理"]
            AuditM["Audit 审计追溯"]
        end
        subgraph JavaOge["OGE 配置管理（仅配置，不执行）"]
            CredCfg["OGE 凭证配置<br/>加密存储 + 下发 Python"]
            TaskView["OGE 任务状态/审计<br/>由 Python 回调写入"]
        end
        subgraph ContractsRepo["📄 GeoMCP 契约（Java 拥有）"]
            C1["geomcp-openapi.yaml"]
            C2["mocks/*.json"]
            C3["conformance/vectors.json"]
        end
        SysMgr["系统管理 · 用户/角色/权限/菜单"]
    end

    subgraph PyExec["🐍 Python 执行面 · geonexus-execution-plane"]
        subgraph CoreEngine["核心引擎"]
            GeoMCP["GeoMCP Server<br/>POST /geomcp"]
            Registry["Registry<br/>GeoCard+Skill 发现 + 契约预过滤"]
            GeoAgentX["GeoAgent<br/>Pipeline DAG 规划 + LLM 翻译"]
            WebBFF["Web BFF<br/>JWT · SSE · 异步任务"]
        end
        subgraph OGEPy["OGE 适配器（Python 统一调用）"]
            OgeClient["OgeClient<br/>OpenAPI 调用"]
            OgeCredMgr["OgeCredentialManager<br/>JWT/tk 运行时获取与续期"]
            ProtoMap["ProtocolMapper<br/>引用协议转换"]
            ExecBridge["OgeExecutor<br/>执行 + 轮询 + 结果"]
        end
        subgraph GeoNodes["GeoNode 集群（本地执行）"]
            NodeA["GeoNode-A<br/>data (2015) :8787"]
            NodeB["GeoNode-B<br/>data (2025) :8788"]
            NodeC["GeoNode-C<br/>compute (GPU) :8789"]
        end
    end

    OGE["🌐 OGE 计算中心（武大）<br/>数据上传 · 算子执行 · 结果获取"]

    Admin -->|"HTTP/JWT（RuoYi 鉴权）"| JavaCP
    Portal -->|"HTTP/SSE（JWT）"| JavaCP
    JavaCP -->|"GeoMCP JSON-RPC 2.0<br/>geo.execute / capabilities / describe / health"| GeoMCP
    JavaCP -->|"REST 元数据下发<br/>GeoCard 同步 / OGE 凭证下发"| PyExec
    JavaCP -.->|"OGE 凭证配置下发<br/>（仅配置，不含密钥明文）"| OgeCredMgr
    OgeCredMgr -->|"运行时获取 JWT + tk"| OGE
    ExecBridge -->|"上传 / 执行 / 轮询 / 结果"| OGE
    ExecBridge -.->|"任务状态 / 审计回调 REST"| JavaCP

    CoreEngine --> GeoNodes
    GeoMCP --> GeoAgentX
    GeoAgentX -->|"本地路由"| GeoNodes
    GeoAgentX -->|"远程路由"| OGEPy
```

## 2. OGE 交互架构（OGE 统一由 Python 调用）

```mermaid
graph TB
    subgraph JavaCfg["☕ Java 侧 — 配置管理与结果消费"]
        direction TB
        J_CredCfg["OGE 凭证配置<br/>（管理后台表单，AES 加密存储）"]
        J_Sync["凭证下发<br/>POST /api/sync/oge-credential"]
        J_Task["任务/审计展示<br/>mogan_oge_task / mogan_audit"]
        J_Contracts["GeoMCP 契约<br/>geonexus-contracts/（Java 拥有）"]

        J_CredCfg --> J_Sync
        J_Task --> J_Contracts
    end

    subgraph PythonExec["🐍 Python 侧 — 统一执行面"]
        direction TB
        P_CredMgr["OgeCredentialManager<br/>接收凭证 → 登录 → 缓存 JWT/tk → 自动续期"]
        P_Client["OgeClient<br/>HTTP 调用 OGE OpenAPI"]
        P_Mapper["ProtocolMapper<br/>OGE 引用 ↔ GeoCard ID"]
        P_Executor["OgeExecutor<br/>执行 + 轮询 + 结果 + 降级"]
        P_Health["/health 子检查<br/>oge_connectivity · oge_credential_valid"]

        J_Sync -->|"凭证配置"| P_CredMgr
        P_CredMgr --> P_Client
        P_Client --> P_Executor
        P_Mapper --> P_Executor
        P_Executor -.->|"任务状态/审计回调"| J_Task
        P_Health -.->|"连通性状态"| J_Task
    end

    subgraph OGE["🌐 OGE OpenAPI 网关"]
        O_Auth["POST /oauth/token · 登录"]
        O_AppKey["POST /open/app/key/create · 申请tk"]
        O_Upload["POST /asset/myData/upload · 上传"]
        O_Execute["POST /openapi/algorithm/{包}/{算子}/execute"]
        O_Status["GET /computation-api/process/{processId}"]
        O_Result["GET /computation-api/process/result/{processId}"]
    end

    P_Client -->|"登录/申请 tk"| O_Auth
    P_Client -->|"tk"| O_AppKey
    P_Executor -->|"上传"| O_Upload
    P_Executor -->|"执行算子"| O_Execute
    P_Executor -->|"轮询状态"| O_Status
    P_Executor -->|"获取结果"| O_Result
```

## 3. 核心执行全链路（时序图）

```mermaid
sequenceDiagram
    actor User as 👤 用户
    participant Admin as 🖥️ 管理后台
    participant Java as ☕ mgbackend
    participant Py as 🐍 Python 执行面
    participant Node as 📦 GeoNode
    participant OGE as 🌐 OGE 计算中心

    Note over User,OGE: 数据上传 + GeoCard 生成

    User->>Admin: 上传 GeoTIFF
    Admin->>Java: POST /mogan/oge/data/upload
    Java->>Py: 记账（指南）：以 tk 调用 OGE 上传
    Py->>OGE: POST /asset/myData/upload (tk)
    OGE-->>Py: assetUuid + 引用
    Py-->>Java: 引用 ProtocolMapper 映射
    Java->>Java: 自动提取 CRS/bbox/波段/分辨率<br/>生成完整 GeoCard Schema
    Java->>Java: 写入 mogan_geocard (status: draft)
    Java->>Py: 元数据下发 → Registry.register(card)
    Py-->>Java: OK

    Note over User,OGE: 审核流程

    User->>Admin: 提交审核
    Admin->>Java: POST /mogan/geocard/submit
    Java->>Java: draft → pending
    User->>Admin: 审核通过
    Admin->>Java: POST /mogan/geocard/approve
    Java->>Java: pending → approved
    Java->>Py: 同步 GeoCard 状态变更
    Py->>Py: Registry 更新 → GeoCard 可被发现

    Note over User,OGE: 算子执行（本地或 OGE 统一经 GeoMCP）

    User->>Admin: 自然语言请求<br/>"分析亚马逊 2015-2025 植被变化"
    Admin->>Java: POST /mogan/oge/execute
    Java->>Java: 查凭证配置（不直接调 OGE）
    Java->>Py: geo.execute (GeoMCP JSON-RPC)
    Py->>Py: LLM 翻译 → 结构化 Goal
    Py->>Py: Registry 搜索 + ContractValidator
    Py->>Py: 资源匹配 + Pipeline DAG 规划

    alt 本地执行
        Py->>Node: Step 1: NDVI @ data-node-a (pushdown)
        Node-->>Py: ndvi_2015.tif
    else OGE 远程执行
        Py->>Py: OgeCredentialManager.ensure_app_key()
        Py->>OGE: POST /openapi/algorithm/Coverage/terrSlope/execute?tk=...
        OGE-->>Py: processId
        loop 轮询
            Py->>OGE: GET /computation-api/process/{processId}
            OGE-->>Py: resultStatus
        end
        Py->>OGE: GET /computation-api/process/result/download/{processId}
        OGE-->>Py: result.tif
    end

    Py-->>Java: 执行结果 + 审计回调
    Java->>Java: 写入 mogan_oge_task + mogan_audit
    Java-->>Admin: 结果
    Admin-->>User: 变化检测结果可视化
```

## 4. GeoCard 完整工作流（5 步协调）

```mermaid
graph LR
    subgraph Step1["① 检索 Retrieve"]
        R1["Registry.search<br/>type=data<br/>bbox + capability"]
        R2["发现 data cards<br/>+ model cards"]
    end

    subgraph Step2["② 契约 Contract"]
        C1["ContractValidator.check<br/>CRS · bbox · temporal<br/>bands · resolution"]
        C2["✓ satisfied<br/>✗ rejected + reasons"]
    end

    subgraph Step3["③ 算力 Resource"]
        S1["match_resource<br/>model.runtime vs<br/>compute cards"]
        S2["gpu=cuda → GPU node<br/>gpu=none → rejected"]
    end

    subgraph Step4["④ 规划 Plan"]
        P1["GeoAgentPlanner<br/>Pipeline DAG"]
        P2["Step1: NDVI @ node-a<br/>Step2: NDVI @ node-b<br/>Step3: Change @ GPU node<br/>(depends_on: [1,2])"]
    end

    subgraph Step5["⑤ 执行 Execute"]
        E1["PlanExecutor.run<br/>拓扑排序 · pushdown"]
        E2["计算移动到数据<br/>数据不出节点"]
    end

    Step1 --> Step2 --> Step3 --> Step4 --> Step5
```

## 5. 契约验证职责划分（CI 各自独立）

```mermaid
graph LR
    subgraph JavaSide["☕ Java CI（mgbackend 仓库）"]
        J1["geonexus-contracts/（Java 拥有）"]
        J2["GeoMCPClientTest（WireMock）"]
        J1 --> J2
    end

    subgraph PythonSide["🐍 Python CI（geonexus-sdk 仓库）"]
        P1["tests/conformance/<br/>geomcp_vectors.py"]
        P2["test_geomcp_conformance.py<br/>（GeoMCPDispatcher 直测）"]
        P1 --> P2
    end

    I1["集成联调<br/>真实执行面 + 真实 mgbackend"]

    JavaSide --> I1
    PythonSide --> I1
```