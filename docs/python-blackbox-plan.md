# Python 执行面"黑盒化"实施路线

## 核心理念

> Java 团队只需要知道三件事：
> 1. Python 执行面在哪里（一个 URL）
> 2. 它能做什么（`geo.capabilities` 返回的方法列表）
> 3. 怎么调用它（JSON-RPC 2.0 over HTTP，Java 侧一个薄客户端）

---

## 路线一：容器化交付（推荐，最彻底的黑盒）

### 1.1 制品形态

Python 执行面打包为一个 **Docker 镜像**，由 Python 专人构建和发布：

```
┌─────────────────────────────────────────┐
│  geonexus-execution-plane:${VERSION}    │
│                                         │
│  EXPOSE 8787   (GeoMCP)                 │
│  EXPOSE 8790   (Registry)               │
│                                         │
│  ENTRYPOINT ["geonexus-execution-plane"] │
│    ├── GeoMCP Server    :8787           │
│    ├── Registry         :8790           │
│    ├── GeoAgent Runtime                 │
│    └── OGE Adapter                      │
│                                         │
│  配置通过环境变量注入：                    │
│    GEONEXUS_REGISTRY_URL=...             │
│    GEONEXUS_OGE_ENDPOINT=...             │
│    GEONEXUS_LLM_API_KEY=...              │
│    GEONEXUS_NODE_API_KEY=...             │
│    GEONEXUS_WORKDIR=/data               │
└─────────────────────────────────────────┘
```

**Java 团队的视角**：一个 Docker 服务，暴露两个端口，通过环境变量配置。

### 1.2 具体操作

```bash
# Python 专人维护的 Dockerfile（在 geonexus-sdk 仓库中）
FROM python:3.12-slim
RUN pip install geonexus-sdk[mcp,oge]==${VERSION}
COPY entrypoint.sh /
ENTRYPOINT ["/entrypoint.sh"]
```

```bash
# entrypoint.sh — 单一入口，Java 团队无需关心内部
#!/bin/bash
set -e
# 启动 Registry（如果未配置外部 Registry）
if [ "${GEONEXUS_REGISTRY_MODE}" = "embedded" ]; then
  geonexus registry start --port 8790 --persist /data/registry.json &
fi
# 启动 GeoMCP Server + GeoAgent
geonexus execution-plane start \
  --geomcp-port 8787 \
  --registry-url "${GEONEXUS_REGISTRY_URL}" \
  --oge-endpoint "${GEONEXUS_OGE_ENDPOINT}" \
  --workdir /data
```

```yaml
# docker-compose.yml — Java 团队的使用方式
services:
  execution-plane:
    image: registry.example.com/geonexus-execution-plane:1.0.0
    ports:
      - "8787:8787"   # GeoMCP
      - "8790:8790"   # Registry
    environment:
      GEONEXUS_REGISTRY_MODE: embedded
      GEONEXUS_OGE_ENDPOINT: http://openge.org.cn/api
      GEONEXUS_LLM_API_KEY: ${LLM_API_KEY}
      GEONEXUS_NODE_API_KEY: ${NODE_API_KEY}
    volumes:
      - ./data:/data
```

### 1.3 版本契约

镜像版本号 = 契约版本。Python 专人发布时附带 changelog：

```
geonexus-execution-plane:1.2.0
  - GeoMCP 协议版本: 1.0.0（未变）
  - 新增 Skill: terrain-analysis（坡度/坡向）
  - 新增 OGE 算子映射: Coverage.terrSlope, Coverage.terrAspect
  - 修复: ContractValidator CRS 比较精度问题
  - 兼容性: 1.1.x → 1.2.0 无破坏性变更
```

---

## 路线二：GeoMCP 接口契约固化（Java 侧只需一个薄客户端）

### 2.1 Java 侧 GeoMCP 客户端

Java 团队只需要一个 **200 行左右的 GeoMCP 客户端**，不依赖任何 Python 库：

```java
// GeoMCPClient.java — Java 团队唯一需要维护的 Python 交互代码
public class GeoMCPClient {
    private final String baseUrl;
    private final String apiKey;
    private final RestTemplate rest;

    public GeoMCPClient(String baseUrl, String apiKey) {
        this.baseUrl = baseUrl;
        this.apiKey = apiKey;
        this.rest = new RestTemplate();
    }

    // 三个核心方法，对应 GeoMCP 协议

    public GeoMCPCapabilities capabilities() {
        return post("/geomcp", request("geo.capabilities", Map.of()),
                    GeoMCPCapabilities.class);
    }

    public GeoMCPDescribe describe(List<String> geocards, List<String> skills) {
        return post("/geomcp", request("geo.describe",
                    Map.of("geocards", geocards, "skills", skills)),
                    GeoMCPDescribe.class);
    }

    public GeoMCPExecuteResult execute(GeoMCPExecuteRequest req) {
        return post("/geomcp", request("geo.execute", req.toParams()),
                    GeoMCPExecuteResult.class);
    }

    // 健康检查（GET，非 JSON-RPC）
    public GeoMCPHealth health() {
        return rest.getForObject(baseUrl + "/health", GeoMCPHealth.class);
    }

    // --- 内部实现 ---
    private JsonNode request(String method, Map<String, Object> params) {
        var body = Map.of("jsonrpc", "2.0", "id", UUID.randomUUID().toString(),
                          "method", method, "params", params);
        return rest.postForObject(baseUrl + "/geomcp", body, JsonNode.class);
    }
    // 错误处理、超时、重试、apiKey 注入等...
}
```

### 2.2 请求/响应模型（纯 POJO，零 Python 依赖）

```java
// GeoMCPExecuteRequest.java
public class GeoMCPExecuteRequest {
    private String skill;                    // 技能名
    private List<String> geocards;           // 引用的 GeoCard ID
    private SpatialContext spatial;          // bbox + crs + resolution
    private TemporalContext temporal;        // start + end + interval
    private Map<String, Object> params;      // 技能参数
    private String requestId;                // 全链路追踪
}

// GeoMCPExecuteResult.java
public class GeoMCPExecuteResult {
    private String status;                   // "ok"
    private String skill;
    private Map<String, Object> outputs;     // {"ndvi_raster": "/out/ndvi.tif", ...}
    private List<String> geocards;
    private String executedBy;
    private String requestId;
}
```

### 2.3 Java 侧调用示例

```java
// 在某个 Service 中，Java 开发者只看到这些：
@Service
public class GeoExecutionService {

    @Autowired
    private GeoMCPClient geomcp;

    public void executeNDVI(String cardId, BBox bbox, LocalDate start, LocalDate end) {
        var req = new GeoMCPExecuteRequest();
        req.setSkill("ndvi-analysis");
        req.setGeocards(List.of(cardId));
        req.setSpatial(new SpatialContext(bbox, "EPSG:4326", 10));
        req.setTemporal(new TemporalContext(start, end, "P5D"));
        req.setRequestId(UUID.randomUUID().toString());

        var result = geomcp.execute(req);
        // result.getOutputs().get("ndvi_raster") → 结果路径
        // result.getOutputs().get("stats") → 统计信息
    }
}
```

---

## 路线三：Mock 服务（Java 团队独立开发，不依赖 Python 环境）

### 3.1 契约优先：OpenAPI 规范

从 GeoMCP 协议生成 OpenAPI 3.0 规范，作为 Java 和 Python 之间的**唯一真相来源**：

```yaml
# geomcp-openapi.yaml — 由 Python 专人维护，Java 团队据此开发和 mock
openapi: 3.0.3
info:
  title: GeoMCP Execution Plane API
  version: 1.0.0
paths:
  /geomcp:
    post:
      summary: JSON-RPC 2.0 dispatch
      requestBody:
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/JsonRpcRequest'
      responses:
        '200':
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/JsonRpcResponse'
  /health:
    get:
      summary: Health check
      responses:
        '200':
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/HealthResponse'
  /capabilities:
    get:
      summary: Capabilities (same as geo.capabilities)
      responses:
        '200':
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/CapabilitiesResponse'
```

### 3.2 WireMock / MockServer 配置

```java
// Java 侧集成测试 — 启动一个 Mock GeoMCP Server
@SpringBootTest
class GeoExecutionServiceTest {

    @RegisterExtension
    static WireMockExtension geomcpMock = WireMockExtension.newInstance()
        .options(wireMockConfig().port(18787))
        .build();

    @Test
    void shouldExecuteNDVI() {
        // Python 专人提供的标准 mock 响应
        geomcpMock.stubFor(post("/geomcp")
            .withRequestBody(matchingJsonPath("$.method", equalTo("geo.execute")))
            .willReturn(aResponse()
                .withHeader("Content-Type", "application/json")
                .withBody("""
                    {
                      "jsonrpc": "2.0",
                      "id": "test-001",
                      "result": {
                        "status": "ok",
                        "skill": "ndvi-analysis",
                        "outputs": {
                          "ndvi_raster": "/out/ndvi.tif",
                          "stats": {"mean": 0.74, "std": 0.12}
                        },
                        "executed_by": "mock-node",
                        "request_id": "test-001"
                      }
                    }
                    """)));

        // Java 开发者正常调用，mock 返回预定义响应
        var result = geomcp.execute(req);
        assertThat(result.getStatus()).isEqualTo("ok");
    }
}
```

Mock 响应文件由 Python 专人维护，放在共享仓库中：

```
geonexus-contracts/
├── geomcp-openapi.yaml           # OpenAPI 规范
├── mocks/
│   ├── capabilities.json         # geo.capabilities 标准响应
│   ├── describe.json             # geo.describe 标准响应
│   ├── execute-ndvi.json         # geo.execute(ndvi) 标准响应
│   ├── execute-change.json       # geo.execute(change-detection) 标准响应
│   └── errors/
│       ├── contract-not-satisfied.json
│       ├── skill-not-found.json
│       └── execution-failed.json
└── conformance/
    └── vectors.json              # 协议一致性测试向量
```

---

## 路线四：统一入口命令（一行命令启动整个执行面）

```bash
# Python 专人提供的 CLI，Java 团队只需记住这一行
geonexus execution-plane start \
  --port 8787 \
  --registry-port 8790 \
  --oge-endpoint http://openge.org.cn/api \
  --oge-username ${OGE_USER} \
  --oge-password ${OGE_PASS} \
  --oge-client-id test \
  --oge-client-secret 123456 \
  --llm-api-key ${LLM_KEY} \
  --node-api-key ${NODE_KEY} \
  --workdir /data/geonexus
```

这个命令内部完成：
1. 启动 Registry（内嵌或连接外部）
2. 启动 GeoMCP Server（暴露 `:8787`）
3. 初始化 GeoAgent Runtime
4. 加载 OGE Adapter
5. 注册内建 Skills（ndvi、change-detection 等）
6. 打印启动就绪日志（含 `geo.capabilities` 摘要）

**Java 团队不需要知道**：Python 虚拟环境、pip 依赖、Skill 注册代码、OGE 协议细节。

---

## 路线五：可观测性边界（排错时 Java 和 Python 各自独立）

### 5.1 全链路 request_id

```
Java 侧生成 request_id → 写入 GeoMCP 请求 → Python 侧所有日志携带
```

```java
// Java 侧
String requestId = "req-" + UUID.randomUUID().toString().substring(0, 8);
req.setRequestId(requestId);
log.info("GeoMCP execute | requestId={} skill={} cards={}", requestId, skill, cards);
```

```python
# Python 侧（geonexus-sdk 内部）
# GeoMCP Server 收到请求后自动提取 request_id，注入到日志上下文
logger.info("geo.execute received", extra={"request_id": request_id})
# 所有下游日志（ContractValidator, Skill handler, OGE client）自动携带
```

### 5.2 排错流程

| 场景 | Java 侧排查 | Python 侧排查 | 协作 |
|------|-----------|-------------|------|
| 请求超时 | 检查 GeoMCPClient 超时配置、网络连通性 | 检查 GeoMCP Server 是否存活、Skill 执行耗时 | 通过 `request_id` 对齐时间线 |
| 契约校验失败 | 查看返回的 error 2000 + reasons | 查看 ContractValidator 日志（哪个字段不满足） | Python 返回的 `error.data.reasons` 已包含足够信息 |
| 执行异常 | 查看返回的 error 2003 + message | 查看 Skill handler 异常堆栈 | Python 返回的 `error.data` 包含 skill 内部错误摘要 |
| OGE 调用失败 | 查看 `mogan_oge_task` 状态 | 查看 OgeClient 日志（HTTP 状态码、响应体） | Python 返回的 `error.data` 包含 OGE 原始错误 |

### 5.3 健康检查仪表盘

Python 执行面暴露的 `/health` 端点返回：

```json
{
  "status": "ok",
  "node": "execution-plane-01",
  "version": "1.0.0",
  "protocol": "geomcp",
  "protocol_version": "1.0.0",
  "time": "2026-09-01T10:00:00Z",
  "checks": {
    "registry": "ok",
    "oge_connectivity": "ok",
    "llm_connectivity": "ok",
    "skills_loaded": 5,
    "geocards_registered": 12
  }
}
```

Java 侧定时探测 `GET /health`，在管理后台展示执行面状态。

---

## 路线六：CI/CD 集成测试（每次变更自动验证契约）

```
geonexus-contracts 仓库（共享）
├── geomcp-openapi.yaml
├── mocks/
└── conformance/vectors.json

        ↓ 被两个 CI 引用

Java CI (.github/workflows/java.yml)        Python CI (.github/workflows/python.yml)
  ├── 启动 WireMock（加载 mocks/）              ├── 启动真实执行面
  ├── 运行 Java 集成测试                         ├── 运行 conformance vectors
  └── 验证 GeoMCPClient 与 mock 兼容             └── 验证 GeoMCP Server 响应与 mock 一致

        ↓                                       ↓
        如果 mock 响应与真实响应不一致 → 构建失败，阻止合并
```

---

## 实施优先级

| 优先级 | 路线 | 投入 | 收益 | 时间 |
|--------|------|------|------|------|
| **P0** | 路线二：GeoMCP 接口契约 + Java 客户端 | 2-3 天 | Java 团队立刻可以开发 | 第 1 周 |
| **P0** | 路线三：Mock 服务 + 契约文件 | 1-2 天 | Java 独立开发不依赖 Python | 第 1 周 |
| **P1** | 路线一：Docker 镜像 | 2-3 天 | 标准化交付，运维简单 | 第 2-3 周 |
| **P1** | 路线四：统一启动命令 | 1 天 | 降低 Python 启动门槛 | 第 2 周 |
| **P2** | 路线五：可观测性 | 2-3 天 | 排错效率 | 第 3-4 周 |
| **P2** | 路线六：CI/CD 集成测试 | 2-3 天 | 防回归 | 第 4-5 周 |

**总投入**：一个 Python 开发人员 3-4 周可以完成 P0+P1 全部路线，之后 Java 团队就可以完全独立开发。