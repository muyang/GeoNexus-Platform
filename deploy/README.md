# 部署（nginx + systemd）

> 目标形态：**nginx 是唯一入口**，静态前端由它直接托管，`/api` 按路径分流到两个后端。
> 这与本地开发（`frontend/vite.config.js` 的 proxy）规则一致，前端不需要区分环境。

```
                  ┌──────────────── nginx :80/443 ────────────────┐
  浏览器 ────────▶│  /                 → frontend/dist（Vue3 SPA） │
                  │  /assets/*         → 长缓存（immutable）        │
                  │  /api/auth  /api/system  /.well-known          │
                  │                    → Java :8080（RuoYi 身份）   │
                  │  /api/*  /uploads/* → Node BFF :3301（治理面）  │
                  └────────────────────────────────────────────────┘
```

## 一、文件

| 文件 | 作用 |
|---|---|
| `nginx/geonexus.conf` | 站点配置：SPA 回落、静态缓存、身份/业务分流、安全响应头、CSP、gzip |
| `systemd/geonexus-portal.service` | Node BFF（网站入口 + 治理面），:3301 |
| `systemd/geonexus-mgbackend.service` | Java 身份与权限权威（签发 RS256 令牌 + JWKS），:8080 |
| `systemd/geonexus-sdk-node.service` | SDK 执行面（真正跑算子），:8787 |
| `systemd/geonexus-sdk-registry.service` | SDK 注册中心（GeoCard 目录与审核状态），:8790 |
| `systemd/geonexus-sdk-web.service` | SDK Web BFF（唯一带 `task_id` 的执行入口，案例复跑用它），:8900 |
| `systemd/geonexus-geokg.service` | GeoKG（知识图谱），:8788 |
| `env/geonexus.env.example` | 共享环境变量模板；安装脚本写入 `/etc/geonexus/geonexus.env` 并随机化口令 |
| `install.sh` | 幂等安装：建用户/目录 → 同步代码 → 构建前端与 Java → 装 nginx 与 systemd → 校验并启动 |

## 二、安装

```bash
# 1) 先看清楚它会做什么（不改系统，不需要 root）
./deploy/install.sh --dry-run

# 2) 真正安装（需要 root；SDK / GeoKG 源码另仓，用参数指过来）
sudo ./deploy/install.sh \
    --sdk-src   /path/to/GeoNexus-SDK \
    --geokg-src /path/to/GeoKG

# 3) 初始管理员口令只打印一次（同时落在 /root/geonexus-admin-password.txt）
```

前提：`node ≥ 22`（BFF 用 `node:sqlite`）、`JDK 17`、`nginx`、可选 `mvn`（构建 Java）与 `python3`（SDK/GeoKG）。

## 三、验收（每条都能自证）

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1/healthz           # 200（nginx）
curl -s http://127.0.0.1/.well-known/jwks.json | head -c 80                 # RSA JWK
TOKEN=$(curl -s -X POST http://127.0.0.1/api/auth/login \
        -H 'content-type: application/json' \
        -d '{"userName":"admin","password":"<初始口令>"}' | python3 -c 'import json,sys;print(json.load(sys.stdin)["token"])')
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1/api/admin/overview -H "authorization: Bearer $TOKEN"  # 200
curl -s http://127.0.0.1/api/sdk/geocards | head -c 120                     # 来自 SDK Registry
# 案例复跑（走 SDK Web BFF，产物由平台受控下发）
curl -s -X POST http://127.0.0.1/api/cases/<案例id>/run -H "authorization: Bearer $TOKEN"
systemctl status geonexus-portal geonexus-mgbackend --no-pager | head -12
journalctl -u geonexus-portal -n 40 --no-pager
```

## 四、几件容易踩的事

1. **`IDENTITY_BASE_URL` 在生产要留空**：nginx 已经把 `/api/auth`、`/api/system` 分给 Java，
   BFF 不需要再代理一次；但 `IDENTITY_JWKS_URL` **必须**指向 Java 的 JWKS —— 业务面要靠它验令牌。
2. **Java 用 PostgreSQL 才持久**：不设 `SPRING_PROFILES_ACTIVE=prod` 会退回内存 H2，重启即空
   （`sys_user`、角色、菜单全没了，管理员也会消失）。
3. **JS 公钥按 kid 轮换**：Java 重启会生成新的 RSA 密钥对，BFF 遇到未知 kid 会立即重取 JWKS
   （`IDENTITY_JWKS_TTL_MS`，默认 60s）；若把 JWKS 缓存在更外层（如 CDN），要留短 TTL。
4. **产物在哪儿**：SDK 的 `geo.execute` 把结果写到执行面**本机路径**，SDK 不提供文件下载。
   平台只允许从 `ARTIFACT_ROOTS` 里的目录读产物（默认执行面工作目录 + 上传目录），
   多机部署时要让这两个目录对 BFF 可见（共享卷）。
5. **CSP 与底图**：`geonexus.conf` 里的 CSP 只放行了 CARTO 与 Esri 的瓦片域名。换天地图等
   需要在 `img-src` / `connect-src` 里补域名，否则地图会静默空白。
6. **任务状态不持久**：SDK Web BFF 的任务在内存里，重启即丢。平台侧 `case_runs` 表才是记录，
   平台会把查不到的 run 标成 `unknown` 并提示可重跑 —— 这是设计，不是 bug。
7. **systemd 单元里的 `ReadWritePaths`**：只放开 `/var/lib/geonexus` 与数据/上传目录；
   如果改了 `DATA_DIR`，记得同步改单元，否则服务起不来（ProtectSystem=strict 会拒绝写入）。

## 五、回滚

```bash
sudo systemctl disable --now geonexus-{portal,mgbackend,sdk-node,sdk-registry,sdk-web,geokg}
sudo rm -f /etc/nginx/conf.d/geonexus.conf && sudo nginx -t && sudo systemctl reload nginx
sudo rm -f /etc/systemd/system/geonexus-*.service && sudo systemctl daemon-reload
# 数据留在 /var/lib/geonexus 与 /opt/geonexus，确认无误后再删
```
