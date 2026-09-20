# 治理面后端：案例库 · 审批 · 配额 · 九大模块内容

> 实现：`lib/governance.js`（路由与落库）、`lib/sdk-client.js`（SDK Registry 客户端）。
> 自证：`node --test tests/` —— 16 个用例，含一个**假 SDK Registry**，把"发布走审批流"整条链路钉住。

## 一、为什么放在平台这一层

| 数据 | 权威在哪 | 平台做什么 |
|---|---|---|
| 账号 / 会话 / 角色 / scopes | 平台身份层（本轮为 Node BFF，目标为 RuoYi） | 签发与判定 |
| **GeoCard 语义与状态** | **SDK Registry** | 只提交、转发审核、查询与归一化，**不复制语义** |
| 案例库 / 审批单 / 配额 / 九大模块内容 | 平台 | 落库、审计、供前台渲染 |

## 二、接口一览

### 案例库
| 方法 | 路径 | 权限 |
|---|---|---|
| GET | `/api/cases?status=draft\|published\|archived` | 公开 |
| POST | `/api/cases` | 登录 |
| GET/PUT/DELETE | `/api/cases/:id` | 读公开 / 写需登录 |
| GET | `/api/sdk/cases` | 公开（**只出已发布**，供前台"可复现案例"） |

### 审批
| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/approvals?status=pending` | 需登录 |
| POST | `/api/approvals` | 提交通用审批单；`kind=geocard-publish` 会同时提交 SDK |
| POST | `/api/approvals/:id/decide` | **需管理员**；`{decision: approve\|reject, note}`，GeoCard 类会转发 SDK |

### 配额
| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/quotas?scope=dept\|user&subject=` | 需登录 |
| POST | `/api/quotas` | **需管理员**；设置部门/个人额度 |
| POST | `/api/quotas/consume` | 需登录；部门与个人**两级取小**，不足返回 409 且不部分扣减 |

### 九大模块内容（后台）
| 方法 | 路径（均需管理员） |
|---|---|
| GET | `/api/admin/modules` → 九个模块及条目数 |
| GET/POST | `/api/admin/modules/:module/items` |
| PUT/DELETE | `/api/admin/modules/:module/items/:id` |

模块键：`portal-home` `visual-earth` `global-cases` `data-resources` `operator-models`
`compute-platform` `open-community` `super-agent` `typical-apps`

### GeoCard 发布与审核（SDK 打通）
| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/sdk/geocards` | 默认只出 **approved**；`?status=all\|pending\|rejected` 需管理员 |
| POST | `/api/sdk/geocards/publish` | 需登录；卡片以 **pending** 提交到 SDK，并镜像成本地审批单 |
| POST | `/api/sdk/geocards/:id/approve` `/reject` | **需管理员**；转发 SDK，附带 `X-API-Key` |

### 总览与审计
`GET /api/admin/overview`（计数 + SDK 状态）、`GET /api/admin/audit?limit=`（只追加）。

## 三、管理员从哪来

`ADMIN_EMAILS`（逗号分隔）是**引导第一位管理员**的唯一入口：命中的邮箱在读取时即获得
`platform_admin` 与 `scopes=['*']`。公众自助注册只得到
`roles=['public_visitor']`、`scopes=['earth:view','card:read','case:read']` —— 注册 ≠ 授权。

```bash
ADMIN_EMAILS=demo@local node server.js
```

## 四、发布审批流的真实时序（已实测）

```
平台 POST /api/sdk/geocards/publish
   └─► SDK POST /cards {status: "pending"}      ← 进 SDK 自己的审核队列
         ├─ 422 契约不合法 → 平台原样回 422，且**不建审批单**（实测报错：'description' is a required property）
         └─ 201 → 平台落 approvals(status=pending, sdkState=pending)
管理员 POST /api/approvals/:id/decide {decision:"approve"}
   └─► SDK POST /cards/:id/approve（X-API-Key）
         └─ 卡片变 approved → 公开目录 GET /api/sdk/geocards 立刻可见
```

实测结果：`modis-nightlights-2024` 经此流程后出现在公开目录（`source=sdk-registry, count=2`）。

## 五、环境变量

| 变量 | 默认 | 用途 |
|---|---|---|
| `REGISTRY_URL` | `http://127.0.0.1:8790` | SDK Registry 地址 |
| `SDK_REGISTRY_API_KEY` | 空 | 转发为 `X-API-Key`（注册中心配了 key 时必填） |
| `ADMIN_EMAILS` | 空 | 管理员引导 |
| `DATA_DIR` / `UPLOADS_DIR` / `SEED_PATH` | 仓库内 | 可覆盖，测试用隔离目录；种子文件缺失不再导致启动失败 |
