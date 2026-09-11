# GeoNexus Management Backend (mgbackend)

> ☕ Java 控制面 — 管理 GeoCard、GeoNode、OGE 凭证、审计追溯。  
> 通过 GeoMCP JSON-RPC 2.0 调用 Python 执行面。

## 快速启动

### 前置条件

- JDK 17+
- Maven 3.9+

```bash
# 安装 JDK 17（macOS）
brew install openjdk@17

# 设置 JAVA_HOME
export JAVA_HOME=/usr/local/opt/openjdk@17
```

### 启动

```bash
cd mgbackend
mvn spring-boot:run
```

启动后：
- API: http://localhost:8080/mogan/geocard/list
- H2 控制台: http://localhost:8080/h2-console (JDBC URL: `jdbc:h2:mem:geonexus_mg`)

### 测试

```bash
# 单元测试 + WireMock 集成测试
mvn test

# 需要 Python 执行面先启动：
#   cd ../geonexus-execution-plane
#   docker compose up -d
#   curl http://127.0.0.1:8787/health
```

## API 概览

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/mogan/geocard/list` | GeoCard 列表 |
| GET | `/mogan/geocard/search?keyword=&assetType=&region=` | 全文搜索 |
| GET | `/mogan/geocard/{id}` | 单个 GeoCard |
| POST | `/mogan/geocard` | 创建草稿 |
| PUT | `/mogan/geocard/{id}` | 更新 |
| DELETE | `/mogan/geocard/{id}` | 删除 |
| POST | `/mogan/geocard/{id}/submit` | 提交审核 |
| POST | `/mogan/geocard/{id}/approve` | 审核通过 |
| POST | `/mogan/geocard/{id}/reject` | 驳回 |
| GET | `/mogan/geocard/execution-plane/health` | 查询执行面健康 |
| GET | `/mogan/geocard/execution-plane/capabilities` | 查询执行面能力 |

## 项目结构

```
mgbackend/
├── pom.xml
├── src/main/java/com/geonexus/mgbackend/
│   ├── GeoNexusMgApplication.java          # Spring Boot 入口
│   ├── config/
│   │   ├── GeoMCPConfig.java               # GeoMCP 客户端 bean
│   │   └── SecurityConfig.java             # Spring Security
│   ├── client/
│   │   ├── GeoMCPClient.java               # GeoMCP JSON-RPC 客户端（200行）
│   │   ├── GeoMCPClientException.java      # 错误码分类
│   │   └── ExecuteRequest.java             # 执行请求模型
│   ├── model/
│   │   └── GeoCard.java                    # GeoCard 实体（MyBatis-Plus）
│   ├── mapper/
│   │   └── GeoCardMapper.java              # MyBatis-Plus Mapper
│   ├── service/
│   │   ├── GeoCardService.java             # GeoCard CRUD + 审核流转
│   │   └── GeoExecutionService.java        # 调用 Python 执行面
│   └── controller/
│       └── GeoCardController.java           # REST API
├── src/main/resources/
│   ├── application.yml                      # 应用配置
│   └── schema.sql                           # 建表 + 种子数据
└── src/test/java/com/geonexus/mgbackend/
    ├── client/
    │   └── GeoMCPClientTest.java            # WireMock 集成测试
    └── controller/
        └── GeoCardControllerTest.java       # 控制器集成测试
```

## 与 Python 执行面对接

Java 控制面通过 `GeoMCPClient` 调用 Python 执行面：

```java
// Java 侧调用 NDVI
GeoMCPClient client = new GeoMCPClient("http://127.0.0.1:8787", "node-api-key");

Map<String, Object> result = client.execute(
    ExecuteRequest.of("ndvi-analysis")
        .params(Map.of("red", "/data/red.tif", "nir", "/data/nir.tif"))
        .requestId("req-001")
);

// 错误处理
try {
    client.execute(...);
} catch (GeoMCPClientException e) {
    if (e.isContractNotSatisfied()) { /* bbox/CRS 不匹配 */ }
    if (e.isSkillNotFound())        { /* 技能未注册 */ }
    if (e.isExecutionFailed())      { /* 执行异常 */ }
}
```

## 生产环境

激活 prod profile 使用 PostgreSQL：

```bash
PG_HOST=localhost PG_PORT=5432 PG_DB=geonexus_mg \
  mvn spring-boot:run -Dspring-boot.run.profiles=prod
```