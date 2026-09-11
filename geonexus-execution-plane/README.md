# GeoNexus Execution Plane

> 一行命令启动整个 Python 执行面。Java 团队只需要 Docker 和 `docker compose`。

## 快速启动

```bash
# 1. 启动
docker compose up -d

# 2. 验证
curl http://127.0.0.1:8787/health
# → {"status":"ok","node":"execution-plane","version":"1.0.0",...}

# 3. 查询能力
curl http://127.0.0.1:8787/capabilities
# → {"protocol":"geomcp","version":"1.0.0","methods":["geo.capabilities",...],"skills":[...]}

# 4. 执行 NDVI
curl -X POST http://127.0.0.1:8787/geomcp \
  -H 'Content-Type: application/json' \
  -d '{
    "jsonrpc":"2.0","id":"req-001","method":"geo.execute",
    "params":{
      "skill":"ndvi-analysis",
      "geocards":["amazon-ndvi-2015"],
      "spatial":{"bbox":[-73.9,-15.0,-44.0,5.0],"crs":"EPSG:4326"},
      "temporal":{"start":"2015-01-01","end":"2015-12-31"},
      "params":{"red":"/data/red_2015.tif","nir":"/data/nir_2015.tif"}
    }
  }'
```

## 端口

| 端口 | 组件 | 用途 |
|------|------|------|
| 8787 | GeoMCP Server | Java 后台调用执行的核心端点 |
| 8790 | Registry | GeoCard + Skill 发现（可选，仅调试用） |
| 8900 | Web BFF | 门户前端（Vue3+Cesium）对接（可选） |

## 容器中包含了什么

```
geonexus-execution-plane:1.0.0
├── GeoMCP Server    :8787 — JSON-RPC 2.0 地理空间交互协议
├── Registry         :8790 — GeoCard + Skill 发现与契约预过滤
├── GeoAgent Runtime       — Pipeline DAG 规划 + LLM 目标翻译
├── OGE Adapter            — OGE 计算中心协议转换（算子定义 → GeoSkill）
├── Web BFF         :8900 — JWT 鉴权 + SSE 推送 + 异步任务
└── 内建技能
    ├── ndvi-analysis       — NDVI 计算
    ├── ndvi-change         — 变化检测（GPU 加速）
    ├── terrain-slope       — 坡度分析（走 OGE Coverage.terrSlope）
    └── terrain-aspect      — 坡向分析（走 OGE Coverage.terrAspect）
```

## 配置

全部通过环境变量配置，详见 `.env.example`：

```bash
# 必填
GEONEXUS_NODE_API_KEY=my-secret-key     # Java 后台调用时的 API Key

# OGE（可选，留空则跳过 OGE 能力）
GEONEXUS_OGE_ENDPOINT=http://openge.org.cn/api
GEONEXUS_OGE_USERNAME=my-oge-account
GEONEXUS_OGE_PASSWORD=my-oge-password

# LLM（可选，留空则 GeoAgent 使用确定性规划）
GEONEXUS_LLM_API_KEY=sk-...
```

## 版本 → 契约对照

| 镜像版本 | GeoMCP 协议 | 兼容性 |
|----------|-------------|--------|
| 1.0.0 | 1.0.0 | 当前 |

镜像版本升级时，参见 `geonexus-contracts/CHANGELOG.md` 了解变更内容。

## 与 Java 后台对接

Java 后台使用 `GeoMCPClient`（见 `java-client/`）调用执行面：

```java
GeoMCPClient client = new GeoMCPClient(
    "http://execution-plane:8787",             // Docker 网络内
    System.getenv("GEONEXUS_NODE_API_KEY")     // 与 docker-compose 中一致
);

// 查询能力
Map<String, Object> caps = client.capabilities();

// 执行 NDVI
ExecuteResult result = client.execute(
    ExecuteRequest.of("ndvi-analysis")
        .geocards(List.of("amazon-ndvi-2015"))
        .spatial(new SpatialContext(List.of(-73.9, -15.0, -44.0, 5.0), "EPSG:4326"))
);

// 错误处理
try {
    client.execute(...);
} catch (GeoMCPClientException e) {
    if (e.isContractNotSatisfied()) { /* bbox/CRS 不匹配 */ }
    if (e.isExecutionFailed())      { /* 执行异常 */ }
}
```

## 排错

```bash
# 健康检查
curl http://127.0.0.1:8787/health

# 查看日志
docker compose logs -f execution-plane

# 重启
docker compose restart execution-plane

# 重建
docker compose build --no-cache execution-plane
docker compose up -d
```

## 文件结构

```
geonexus-execution-plane/
├── Dockerfile                  # 镜像构建
├── docker-compose.yml          # 一键部署
├── .env.example                # 环境变量模板
├── entrypoint.sh               # 容器入口
├── pyproject.toml              # Python 包配置
├── requirements.txt            # 依赖
├── README.md                   # ← 本文档
└── src/geonexus_execution_plane/
    ├── __init__.py             # 版本
    ├── main.py                 # 核心编排器（~200 行）
    ├── cli.py                  # CLI 入口（`geonexus execution-plane start`）
    ├── skills.py               # 内建技能定义
    └── oge_adapter.py          # OGE 适配器
```