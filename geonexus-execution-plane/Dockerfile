# =============================================================
# GeoNexus Execution Plane — Docker Image
# =============================================================
# Java 团队使用方式：
#   docker run -p 8787:8787 -p 8790:8790 \
#     -e GEONEXUS_OGE_ENDPOINT=http://openge.org.cn/api \
#     -e GEONEXUS_NODE_API_KEY=my-key \
#     registry.example.com/geonexus-execution-plane:1.0.0
# =============================================================

FROM python:3.12-slim AS builder

WORKDIR /build

# 安装构建依赖
RUN pip install --no-cache-dir build

# 先复制依赖声明，利用 Docker 缓存
COPY pyproject.toml requirements.txt ./
COPY src/ src/

# 构建 wheel
RUN python -m build --wheel

# ── 运行阶段 ──
FROM python:3.12-slim

LABEL org.opencontainers.image.title="GeoNexus Execution Plane"
LABEL org.opencontainers.image.description="GeoMCP + Registry + GeoAgent + OGE Adapter"
LABEL org.opencontainers.image.version="1.0.0"
LABEL org.opencontainers.image.source="https://github.com/geonexus/geonexus"

# 安装系统依赖（rasterio, GDAL 等）
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgdal-dev \
    && rm -rf /var/lib/apt/lists/*

# 复制 wheel 并安装
COPY --from=builder /build/dist/*.whl /tmp/
RUN pip install --no-cache-dir /tmp/*.whl && rm /tmp/*.whl

# 暴露端口
EXPOSE 8787  # GeoMCP
EXPOSE 8790  # Registry
EXPOSE 8900  # Web BFF (optional)

# 工作目录
WORKDIR /data/geonexus
VOLUME /data/geonexus

# 健康检查
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python3 -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8787/health')" || exit 1

# 启动执行面
ENTRYPOINT ["geonexus-execution-plane"]