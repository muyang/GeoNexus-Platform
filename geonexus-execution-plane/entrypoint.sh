#!/bin/bash
# =============================================================
# GeoNexus Execution Plane — 容器入口脚本
# =============================================================
# 此脚本供 Docker 容器使用，也支持直接运行：
#   bash entrypoint.sh
# =============================================================
set -euo pipefail

echo "==> GeoNexus Execution Plane starting..."
echo "    GeoMCP port: ${GEONEXUS_GEOMCP_PORT:-8787}"
echo "    Registry port: ${GEONEXUS_REGISTRY_PORT:-8790}"
echo "    Workdir: ${GEONEXUS_WORKDIR:-/data/geonexus}"

# 确保工作目录存在
mkdir -p "${GEONEXUS_WORKDIR:-/data/geonexus}"

# 启动执行面
exec python3 -m geonexus_execution_plane.main