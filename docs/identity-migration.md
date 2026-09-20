# 身份迁 RuoYi：把身份权威从 Node 移到 Java

> 目标：Platform 是唯一身份权威，且权威在 **RuoYi 风格的 Java 管理面**（`mgbackend`）。
> 本文记录迁移的**契约、实现、验证**，以及业务面如何接受 Java 令牌。
> 相关：`docs/user-management.md`（设计）、`docs/backend-governance.md`（治理面）。

---

## 一、迁移动机（来自完成度评估）

原状：Java `SecurityConfig` 全部 `permitAll`（无鉴权），而 Node 门户自建了 `users`/`sessions`
（PBKDF2 + 会话令牌）。这正是 `user-management.md` 第 1 条红线要禁止的"第二张用户表"。

现在：**Java 是权威**，Node BFF 通过 JWKS 验签**接受** Java 令牌。

---

## 二、Java 侧实现（RuoYi 模型）

| 层 | 文件 | 说明 |
|---|---|---|
| 表 | `src/main/resources/schema.sql` | `sys_user` / `sys_dept` / `sys_role` / `sys_menu` / `sys_user_role` / `sys_role_menu` / `sys_role_dept` / `sys_logininfor` / `sys_oper_log` |
| 实体与 Mapper | `identity/model`、`identity/mapper` | MyBatis-Plus `BaseMapper`；Mapper 扫描改为**按 `@Mapper` 注解全包扫描**（新增子包不必改配置） |
| 令牌 | `identity/service/JwtService.java` | **RS256**，claim：`sub/userId/userName/deptId/deptPath/tenant/accountType/roles/scopes/jti`；access 30min + refresh 7天；`jti` 黑名单；令牌头带 `kid` |
| 公钥分发 | `identity/web/JwksController.java` | `GET /.well-known/jwks.json`（RSA JWK，含 `kid/n/e`） |
| 认证 | `identity/web/AuthController.java` | `POST /api/auth/register`(201) · `POST /api/auth/login` · `GET /api/auth/me` · `POST /api/auth/logout` · `GET /api/auth/data-scope` |
| 鉴权 | `identity/web/RequiresPerm.java` + `IdentityInterceptor` | 注解式细粒度权限；缺令牌 **401**、权限不足 **403** |
| 权限解析 | `identity/service/PermissionService.java` | `scopes` = 角色可见菜单的 `perms` 并集（与 RuoYi 按钮级权限同源）；`data_scope` 1–5 解析 |
| 种子 | `identity/seed/IdentitySeeder.java` | 部门树 6（含"公众用户"独立根部门）/ 角色 7 / 菜单 22 / 管理员 |

**管理员从哪来**：`IdentitySeeder` 用 `geonexus.identity.admin-user-name|admin-password`
（默认 `admin` / `Admin@GeoNexus2026`）建第一个管理员。公众自助注册只得到
`roles=['public_visitor']`、`scopes=['earth:view','card:read','case:read']` —— **注册 ≠ 授权**。

---

## 三、业务面如何接受 Java 令牌（`lib/jwt-verify.js`）

身份迁走之后，Node BFF 若只认自己的会话令牌，业务面会全 401。所以加了一个**零依赖**的验签器：

- 启动即拉取 JWKS 并缓存（`IDENTITY_JWKS_URL`，默认 `http://127.0.0.1:8080/.well-known/jwks.json`）
- `verify()` **同步**（`crypto.verify('RSA-SHA256', …)`），因此不必把既有的同步
  `getAuthUser`/`requireAuth` 调用点改成异步
- 轮换：遇到**未知 `kid`** 时立即重取（并发去重），并打日志；TTL 默认 60s（`IDENTITY_JWKS_TTL_MS`）
- 无 `kid` 的令牌回退到"唯一公钥/逐个试"；**非 RS256 一律拒绝**（不允许 alg 降级）
- claim → 内部用户形状（`roles`/`scopes`/`isAdmin`），与既有权限判定无缝衔接

`getAuthUser` 的判定顺序：`gnx_…` 会话令牌（历史兼容）→ 否则按 JWT 验签。

---

## 四、前端如何分流（部署形态）

`frontend/vite.config.js` 把两个后端按职责分开（**这也是生产反向代理的规则**）：

| 路径 | 目标 | 职责 |
|---|---|---|
| `/api/auth`、`/api/system`、`/.well-known` | Java（`VITE_IDENTITY_TARGET`，默认 8080） | 身份与权限 |
| 其余 `/api` | Node BFF（`VITE_API_TARGET`，默认 3101） | 案例 / 审批 / 配额 / 九大模块内容 / SDK 代理 |

前端代码**未因迁移改动**：`authApi` 的路径与响应形状在两个后端上一致。

---

## 五、验证（可复现）

### 5.1 Java 单测：30/30 通过

```bash
export PATH="$HOME/.nvm/versions/node/v22.22.1/bin:$PATH"
# 本机 ~/.m2 不可写，用可写本地仓库；Maven 从 https://archive.apache.org/dist/maven/ 下载
mvn -Dmaven.repo.local=/tmp/m2repo test      # Tests run: 30, Failures: 0, Errors: 0 → BUILD SUCCESS
```
覆盖：注册只得到"能看"、重复邮箱 409、管理员通配 scope、`/me` 401 语义、
`system:user:list` 403/200、JWKS 形状、**失败 5 次锁定**、登出后旧令牌失效、
伪造令牌被拒、数据范围（管理员=全部 / 公众=仅本人）、停用账号不能登录、
`data_scope` 1–5 的解析（含"本部门及以下"的祖链展开）。

### 5.2 Node 侧：23/23 通过（含迁移专项）

```bash
npm test        # node --test tests/*.test.mjs
```
其中 2 条专测迁移：**JWKS 验签通过后 Java 令牌在业务面有效**（含篡改/过期/未知 kid/alg 降级
→401，权限不足→403），以及**公钥轮换后自动重取**。

### 5.3 真机链路（本轮实测）

```
前端 :5173 ──/api/auth/login──▶ Java :8090   ← RS256 + kid=geonexus-…
            令牌头 {"kid":"geonexus-…","alg":"RS256"}
前端 :5173 ──/api/cases────────▶ Node :3101  HTTP 200
           ──/api/admin/overview▶ Node :3101  HTTP 200   ← Java 令牌 + JWKS 验签
           ──/api/sdk/geocards──▶ Node :3101  HTTP 200
```
界面实拍（`docs/images/frontend-admin-java-identity.png`）显示账号为
`admin@geonexus.local · platform_admin · scopes *` —— 身份来自 Java，业务数据来自 Node BFF。

---

## 六、已知边界

1. **Node 的 `users`/`sessions` 表仍在**（历史兼容）。生产切换后应停止门户自助注册，
   把 Node 仅作为业务面；彻底删除需等 RuoYi 的注册/改密界面就绪。
2. Java 侧**只有只读的系统管理接口**（`/api/system/users|roles|menus`）；用户增删改、
   角色分配、菜单维护仍待补（RuoYi 原生功能）。
3. Java 的 `SecurityConfig` 仍是 `permitAll` + 拦截器鉴权；迁到标准 JWT Filter 链是后续收敛项。
4. `mvn` 与 `~/.m2` 的环境限制见 `README.md`（本机需 `-Dmaven.repo.local`）。
