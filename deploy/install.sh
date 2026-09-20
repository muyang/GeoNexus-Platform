#!/usr/bin/env bash
# ============================================================================
# GeoNexus 部署脚本（幂等；可先用 --dry-run 看它到底会做什么）
#
#   sudo ./deploy/install.sh --dry-run          # 只打印，不改系统
#   sudo ./deploy/install.sh                    # 真正安装
#   sudo ./deploy/install.sh --sdk-src /path/to/GeoNexus-SDK --geokg-src /path/to/GeoKG
#
# 做的事：建用户与目录 → 同步代码 → 构建前端与 Java → 装环境变量 →
#         装 nginx 配置与 systemd 单元 → 校验并启动 → 打印验收命令
# ============================================================================
set -euo pipefail

PREFIX=/opt/geonexus
REPO="$(cd "$(dirname "$0")/.." && pwd)"
SDK_SRC="${SDK_SRC:-}"
GEOKG_SRC="${GEOKG_SRC:-}"
SERVICE_USER=geonexus
ENV_DIR=/etc/geonexus
DRY_RUN=0

while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run)     DRY_RUN=1 ;;
    --prefix)      PREFIX="$2"; shift ;;
    --sdk-src)     SDK_SRC="$2"; shift ;;
    --geokg-src)   GEOKG_SRC="$2"; shift ;;
    -h|--help)     sed -n '2,12p' "$0"; exit 0 ;;
    *) echo "未知参数：$1" >&2; exit 2 ;;
  esac
  shift
done

run() {  # 打印并且（非 dry-run 时）执行
  if [ "$DRY_RUN" = 1 ]; then printf '  [dry-run] %s\n' "$*"; else printf '  + %s\n' "$*"; "$@"; fi
}
say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
need() { command -v "$1" >/dev/null 2>&1 || { echo "缺少命令：$1（$2）" >&2; exit 1; }; }

say "0) 环境检查"
need node  "网站入口需要 Node 22+（node:sqlite）"
need npm   "前端构建需要 npm"
need java  "身份服务需要 JDK 17+"
need nginx "入口反代需要 nginx"
[ -d "$REPO/frontend" ] || { echo "请在仓库根目录运行本脚本（当前：$REPO）" >&2; exit 1; }
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge 22 ] || { echo "Node 版本过低：$(node -v)（需 ≥22）" >&2; exit 1; }
echo "  node $(node -v) · java $(java -version 2>&1 | head -1 | awk '{print $3}' | tr -d '\"') · nginx $(nginx -v 2>&1 | awk -F/ '{print $2}')"
if [ "$DRY_RUN" != 1 ] && [ "$(id -u)" != 0 ]; then echo "需要 root（或加 --dry-run 先看步骤）" >&2; exit 1; fi

say "1) 用户与目录"
if ! id -u "$SERVICE_USER" >/dev/null 2>&1; then
  run useradd --system --create-home --home-dir "$PREFIX" --shell /usr/sbin/nologin "$SERVICE_USER"
else
  echo "  用户 $SERVICE_USER 已存在，跳过"
fi
run mkdir -p "$PREFIX/platform" "$PREFIX/sdk" "$PREFIX/geokg" "$ENV_DIR" /var/lib/geonexus/data /var/lib/geonexus/uploads /var/lib/geonexus/exec-work

say "2) 同步代码（保留运行期数据）"
run rsync -a --delete --exclude node_modules --exclude .git --exclude frontend/dist \
    --exclude data --exclude uploads "$REPO/" "$PREFIX/platform/"
[ -n "$SDK_SRC" ]   && run rsync -a --delete --exclude .git --exclude __pycache__ "$SDK_SRC/"   "$PREFIX/sdk/"
[ -n "$GEOKG_SRC" ] && run rsync -a --delete --exclude .git --exclude __pycache__ "$GEOKG_SRC/" "$PREFIX/geokg/"
echo "  （SDK/GeoKG 源码用 --sdk-src/--geokg-src 指定；不指定则跳过）"

say "3) 构建前端（Vue3 + Vite）"
if [ "$DRY_RUN" = 1 ]; then
  echo "  [dry-run] cd $PREFIX/platform/frontend && npm ci && npm run build"
else
  ( cd "$PREFIX/platform/frontend" && npm ci --no-audit --no-fund && npm run build )
fi

say "4) 打包 Java 身份服务"
if [ "$DRY_RUN" = 1 ]; then
  echo "  [dry-run] cd $PREFIX/platform/mgbackend && mvn -DskipTests package"
else
  ( cd "$PREFIX/platform/mgbackend" && mvn -DskipTests package )
fi

say "5) 环境变量（仅首次生成口令）"
if [ -f "$ENV_DIR/geonexus.env" ]; then
  echo "  $ENV_DIR/geonexus.env 已存在，保留不动（如需重置请手动编辑）"
else
  ADMIN_PW="$(head -c 18 /dev/urandom | base64 | tr -d '/+=' | head -c 20)"
  SDK_PW="$(head -c 18 /dev/urandom | base64 | tr -d '/+=' | head -c 20)"
  if [ "$DRY_RUN" = 1 ]; then
    echo "  [dry-run] 由 env/geonexus.env.example 生成 $ENV_DIR/geonexus.env 并随机化两个口令"
  else
    install -m 0640 -o root -g "$SERVICE_USER" /dev/null "$ENV_DIR/geonexus.env"
    sed -e "s|__CHANGE_ME__|$SDK_PW|" -e "s|^GEONEXUS_IDENTITY_ADMINPASSWORD=.*|GEONEXUS_IDENTITY_ADMINPASSWORD=$ADMIN_PW|" \
        "$REPO/deploy/env/geonexus.env.example" > "$ENV_DIR/geonexus.env"
    chmod 0640 "$ENV_DIR/geonexus.env"; chown root:"$SERVICE_USER" "$ENV_DIR/geonexus.env"
    printf '\n  \033[1m初始管理员口令：%s\033[0m（登录后请立即修改）\n' "$ADMIN_PW" | tee /root/geonexus-admin-password.txt
  fi
fi

say "6) 安装 nginx 站点配置"
run install -m 0644 "$REPO/deploy/nginx/geonexus.conf" /etc/nginx/conf.d/geonexus.conf
if [ "$DRY_RUN" = 1 ]; then
  echo "  [dry-run] nginx -t && systemctl reload nginx"
else
  nginx -t && systemctl reload nginx
fi

say "7) 安装并启动 systemd 单元"
for u in "$REPO"/deploy/systemd/*.service; do
  run install -m 0644 "$u" "/etc/systemd/system/$(basename "$u")"
done
if [ "$DRY_RUN" = 1 ]; then
  echo "  [dry-run] systemctl daemon-reload && systemctl enable --now geonexus-{mgbackend,portal,sdk-node,sdk-registry,sdk-web,geokg}"
else
  systemctl daemon-reload
  systemctl enable --now geonexus-mgbackend geonexus-portal geonexus-sdk-registry geonexus-sdk-node geonexus-sdk-web geonexus-geokg
fi

say "8) 验收（逐条都能自证）"
cat <<'TIP'
  curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1/healthz                 # 期望 200
  curl -s http://127.0.0.1/.well-known/jwks.json | head -c 80                       # 期望 RSA JWK
  curl -s -X POST http://127.0.0.1/api/auth/login -H 'content-type: application/json' \
       -d '{"userName":"admin","password":"<初始口令>"}' | head -c 120               # 期望 RS256 令牌
  curl -s http://127.0.0.1/api/sdk/geocards | head -c 120                            # 期望 SDK Registry 卡片
  systemctl status geonexus-portal --no-pager | head -5
  journalctl -u geonexus-portal -n 30 --no-pager
TIP
