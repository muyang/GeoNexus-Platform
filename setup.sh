#!/bin/bash
# ============================================================
# GeoNexus Development Environment Setup
# ============================================================
# 一键配置 Java mgbackend + Python 执行面开发环境
#
# 使用方法：
#   chmod +x setup.sh
#   ./setup.sh
# ============================================================
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
echo "==> GeoNexus Dev Setup"
echo "    Root: $ROOT"

# ============================================================
# Step 1: Java 工具链
# ============================================================
echo ""
echo "--- Java 工具链 ---"

install_jdk() {
    if command -v java &>/dev/null && java -version 2>&1 | grep -q 'version "17'; then
        echo "[OK] JDK 17 already installed: $(java -version 2>&1 | head -1)"
        return 0
    fi

    echo "    Installing JDK 17..."

    # 方法 A: Homebrew（macOS）
    if command -v brew &>/dev/null; then
        brew install openjdk@17 && echo "[OK] JDK 17 installed via Homebrew" && return 0
    fi

    # 方法 B: 直接下载 Adoptium
    JDK_URL="https://github.com/adoptium/temurin17-binaries/releases/download/jdk-17.0.20.1%2B1/OpenJDK17U-jdk_x64_mac_hotspot_17.0.20.1_1.tar.gz"
    JDK_DIR="/usr/local/opt/openjdk@17"
    echo "    Downloading from Adoptium..."
    curl -fsSL "$JDK_URL" -o /tmp/jdk17.tar.gz
    sudo mkdir -p "$JDK_DIR"
    sudo tar xzf /tmp/jdk17.tar.gz -C "$JDK_DIR" --strip-components=1
    rm /tmp/jdk17.tar.gz
    echo "[OK] JDK 17 installed to $JDK_DIR"
}

install_maven() {
    if command -v mvn &>/dev/null; then
        echo "[OK] Maven already installed: $(mvn --version 2>&1 | head -1)"
        return 0
    fi

    echo "    Installing Maven..."
    if command -v brew &>/dev/null; then
        brew install maven && echo "[OK] Maven installed" && return 0
    fi
    echo "[WARN] Maven not found. Please install manually: https://maven.apache.org"
}

install_jdk
install_maven

# 设置 JAVA_HOME
if [ -d "/usr/local/opt/openjdk@17" ]; then
    export JAVA_HOME="/usr/local/opt/openjdk@17"
    echo "[OK] JAVA_HOME=$JAVA_HOME"
fi

# ============================================================
# Step 2: Python 3.12+
# ============================================================
echo ""
echo "--- Python 3.12+ ---"

PYTHON_BIN=""
for py in python3.12 python3.13 python3.14; do
    if command -v "$py" &>/dev/null; then
        PYTHON_BIN="$py"
        break
    fi
done

if [ -z "$PYTHON_BIN" ]; then
    echo "    Installing Python 3.12..."
    if command -v brew &>/dev/null; then
        brew install python@3.12
        PYTHON_BIN="python3.12"
    else
        echo "[ERROR] Please install Python 3.12+ manually: https://python.org"
        exit 1
    fi
fi
echo "[OK] Python: $($PYTHON_BIN --version)"

# ============================================================
# Step 3: Python venv + geonexus-sdk
# ============================================================
echo ""
echo "--- Python 执行面依赖 ---"

VENV_DIR="$ROOT/.venv-py312"
if [ ! -d "$VENV_DIR" ]; then
    $PYTHON_BIN -m venv "$VENV_DIR"
fi

"$VENV_DIR/bin/pip" install -q --upgrade pip
"$VENV_DIR/bin/pip" install -q -e "$ROOT/mvp/"
echo "[OK] geonexus-sdk installed (editable)"

# 安装 geonexus-execution-plane 额外依赖
"$VENV_DIR/bin/pip" install -q -e "$ROOT/geonexus-execution-plane/" 2>/dev/null || true

# ============================================================
# Step 4: 验证
# ============================================================
echo ""
echo "--- 验证 ---"

echo -n "    Java:  "
java -version 2>&1 | head -1 || echo "[WARN] JDK not working"

echo -n "    Maven: "
mvn --version 2>&1 | head -1 || echo "[WARN] Maven not working"

echo -n "    Python SDK: "
"$VENV_DIR/bin/python" -c "import geonexus; print('geonexus', geonexus.__version__)" 2>&1 || echo "[WARN] SDK not installed"

echo -n "    NDVI handler tests: "
cd "$ROOT/geonexus-execution-plane"
"$VENV_DIR/bin/python" -m pytest tests/test_handlers_e2e.py -q 2>&1 | tail -1 || echo "[WARN] E2E tests failed (may need Python 3.12)"

echo -n "    mgbackend compile: "
cd "$ROOT/mgbackend"
mvn compile -q 2>&1 && echo "OK" || echo "[WARN] mgbackend compile failed"

echo ""
echo "========================================"
echo "  GeoNexus Dev Environment Ready!"
echo "========================================"
echo ""
echo "Start Python execution plane:"
echo "  source $VENV_DIR/bin/activate"
echo "  geonexus execution-plane start --port 8787"
echo ""
echo "Start Java mgbackend:"
echo "  cd mgbackend && mvn spring-boot:run"
echo ""
echo "Test:"
echo "  curl http://localhost:8787/health"
echo "  curl http://localhost:8080/mogan/geocard/list"