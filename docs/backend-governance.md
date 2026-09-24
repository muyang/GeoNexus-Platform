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

### 方案（Recipe）：目录 → 派生 → 物化 → 执行 → 交付物
方案是"知识产品"的**可执行**一面：卡片说这是什么，方案说怎么跑，交付物是这次跑的结论。
平台在这里只做三件事：提交、转发、落地 —— **参数契约与任务图都由 SDK 判定**
（`geo.plan`，见 SDK 的 `docs/RECIPE.md`），平台不复制一份校验规则，也不自己排 DAG。

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/recipes` | SDK 目录（默认只看 approved）∪ 本平台绑定；`?q=&param=&role=&caseId=&all=true` |
| POST | `/api/recipes` | **需 `geocard:publish`**；方案以 **pending** 进 SDK 审核队列 |
| POST | `/api/recipes/plan` | 物化但不执行；参数契约错误原样回 **400 + `field`/`code`**（前端高亮输入框） |
| POST | `/api/recipes/fork` | 派生：新地址 + 新参数，源方案不动；默认同时建一个草稿案例 |
| POST | `/api/recipes/run` | 需登录；先物化再按任务图逐步提交，产出交付物记录 |
| GET | `/api/cases/:id/layers` | 四级 LOD + 双时间轴（数据时间 vs 执行时间）的**数据面**，画法由前端定 |
| GET | `/api/cases/:id/deliverables` | 该案例的交付物清单 |
| GET | `/api/deliverables/:id` | 交付物元数据（**不含磁盘路径**） |
| GET | `/api/deliverables/:id/report` | 需登录；按白名单受控读取产物文件（文本类自动补 `charset=utf-8`） |
| GET | `/api/admin/recipes` | 后台「方案」页签：绑定 + SDK 目录 + 待审计数（需 `approval:list`） |
| GET | `/api/admin/deliverables` | 后台「交付物」页签：清单 + 角色统计（需 `approval:list`） |

**发布与审批（批 2）**：发布方案 = 提交一张 `recipe-publish` 审批单，与 GeoCard 发布
完全同一条链路 —— SDK 侧 pending，平台侧 pending，裁决时平台把决定转发给 SDK，
并把结果同步回平台绑定（`case_recipes.status`）。派生（fork）同样默认生成审批单：
派生件要过审才能被运行（`geo.plan` 只物化已批准的方案）。

**可见性继承（批 2）**：组合案例的可见性 = 其**承载内容的组成项**里最严的一档
（规则见 `lib/visibility.js`，与 SDK 的 `geonexus/geocard/visibility.py` 同源）。
两条不可动摇的约定：组成项解析不到 ⇒ 整案不可见；对外统一返回 **404，不是 403**
（403 等于承认"存在一个你看不到的案例"）。案例列表里也不出现被挡的条目，
只把 `hidden` 计数给管理员。被挡的访问会在审计里留下 `case.hidden`（含档位与
`granted`），供运维排查"为什么这个案例不见了"。

**可视化（批 3）**：`/api/cases/:id/layers` 是**数据面**，画法在前端
（`frontend/src/composables/caseLayers.js` + 两个引擎的 `syncCaseOverlay`）：

- **四级 LOD**：L1 案例 AOI 面 → L2 步骤足迹（可播放，按执行顺序）→ L3 图层组（交付物
  按角色分组）→ L4 报告面板联动（在 L3 点开即展开 iframe）。
- **双时间轴**：`timeline.dataTime`（案例研究的时段）与 `timeline.executionTime`
  （哪一次运行）**分开画**。混在一根轴上，用户就分不清"结果变了"是数据换了还是重跑过。
- **血缘弧线**：`components[]` 带 `bbox` 与 `visibility`。默认**关**——一开就是一堆线；
  只画当前选中的那一个案例；两端都要有范围才画（算子没有 bbox 就不画）。
- **非空间案例**：`spatial: false` 时不进地球（硬塞上去等于给出一个假位置），
  只出现在侧栏；它的 L2/L3/L4 仍然可用。

**后台页签（批 2）**：`GET /api/admin/recipes`（绑定 + 目录 + 待审计数）与
`GET /api/admin/deliverables`（按角色统计），对应后台「方案」「交付物」两个页签，
均需 `approval:list`。

落地约定（都有测试钉住，见 `tests/api.test.mjs` 的「方案」「可见性」「后台」三组）：

- **派生件默认待审**：`fork` 出的方案与它派生的案例都是草稿态，未发布不能运行（409）。
- **参数只在 SDK 判定**：`param_out_of_range` / `param_missing` 等由 SDK 返回，平台翻译成
  400 并带上 `field`，不自己判断"2015 到 2024 之间"。
- **逐步执行、逐步留痕**：每个配方步骤一条 `case_runs` 记录（`stepId` 显式落字段），
  上游产物按方案声明的 `step://s3/report` 引用名传给下游；上游没成功就中止整次运行，
  不产出半成品。
- **交付物 ≠ 中间产物**：只有方案 `outputs` 声明过的才算交付物；路径不进公开响应，
  下载走 `ARTIFACT_ROOTS` 白名单（越界 403，与单技能复跑同一策略）。
- **目录降级要说清**：SDK 目录不可达时，平台侧绑定照常返回，响应里的 `sdk.status`
  标成 `down` 并给出错误，不假装目录是空的。
- **可空字段能真的被清空**：`bbox` / `temporal` / `sensitivity` 用"键是否存在"判断，
  而不是 `??` —— 否则"显式传 null"会被当成"没改"，编辑者永远删不掉一个错的范围；
  更新允许**局部**提交（只改一个字段不必带上整份案例，标题也不用重复给）。

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
| `REGISTRY_URL` | `http://127.0.0.1:8790` | SDK Registry 地址（卡片目录 **与方案目录**） |
| `SDK_NODE_URL` | `http://127.0.0.1:8787` | GeoNode 地址：`geo.plan` 物化方案的入口 |
| `ARTIFACT_ROOTS` | `UPLOADS_DIR:SDK_WORKDIR` | 交付物/产物可读取的根目录白名单（冒号分隔） |
| `ADMIN_EMAILS` | 空 | 管理员引导；只有管理员（或带 `visibility:*` scope）能看到受限/敏感案例 |
| `SDK_REGISTRY_API_KEY` | 空 | 转发为 `X-API-Key`（注册中心配了 key 时必填） |
| `ADMIN_EMAILS` | 空 | 管理员引导 |
| `DATA_DIR` / `UPLOADS_DIR` / `SEED_PATH` | 仓库内 | 可覆盖，测试用隔离目录；种子文件缺失不再导致启动失败 |
