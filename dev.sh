#!/bin/bash
# ============================================================
# GeoNexus 开发环境一键启动
# ============================================================
# 用法：
#   ./dev.sh python     # 只启动 Python 执行面 (:8787)
#   ./dev.sh java       # 只启动 Java mgbackend (:8080)
#   ./dev.sh all        # 同时启动两者（默认）
#   ./dev.sh test       # 运行两端全部测试
#   ./dev.sh stop       # 停止所有服务
# ============================================================
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"

# ---------------------------------------------------------------------------
# 工具链解析：优先用仓库内自带的，否则退回系统安装
# ---------------------------------------------------------------------------
# 本仓库历史上把 .jdk17 / .maven / .venv-py39 / tmp/m2-repo 一起分发，后来
# 作为大二进制移出。缺了它们时这里给出明确指引，而不是让
# `mvn: command not found` 飘过去，或者更糟——用错版本继续跑。
resolve_java() {
    if [ -x "$ROOT/.jdk17/jdk-17.0.2.jdk/Contents/Home/bin/java" ]; then
        export JAVA_HOME="$ROOT/.jdk17/jdk-17.0.2.jdk/Contents/Home"
    elif [ -n "${JAVA_HOME:-}" ] && [ -x "$JAVA_HOME/bin/java" ]; then
        export JAVA_HOME
    elif [ -x /usr/libexec/java_home ] && /usr/libexec/java_home -v17 >/dev/null 2>&1; then
        export JAVA_HOME="$(/usr/libexec/java_home -v17)"
    elif command -v java >/dev/null 2>&1; then
        echo "WARN: 未找到 JDK 17，使用 PATH 上的 java：$(java -version 2>&1 | head -1)" >&2
    else
        echo "ERROR: 找不到 JDK 17。设置 JAVA_HOME，或把 JDK 放到 $ROOT/.jdk17/" >&2
        exit 1
    fi
}

resolve_maven() {
    if [ -x "$ROOT/.maven/libexec/bin/mvn" ]; then
        export PATH="${JAVA_HOME:+$JAVA_HOME/bin:}$ROOT/.maven/libexec/bin:$PATH"
    elif command -v mvn >/dev/null 2>&1; then
        export PATH="${JAVA_HOME:+$JAVA_HOME/bin:}$PATH"
    else
        echo "ERROR: 找不到 Maven。装一个 mvn，或把 Maven 解压到 $ROOT/.maven/" >&2
        exit 1
    fi
}

resolve_python() {
    if [ -x "$ROOT/.venv-py39/bin/python" ]; then
        PYTHON_VENV="$ROOT/.venv-py39"
    elif [ -x "$ROOT/.venv-py312/bin/python" ]; then
        PYTHON_VENV="$ROOT/.venv-py312"
    elif [ -n "${PYTHON_VENV:-}" ] && [ -x "$PYTHON_VENV/bin/python" ]; then
        :
    else
        echo "ERROR: 找不到 Python 虚拟环境。先跑 ./setup.sh，或手动：" >&2
        echo "  python3 -m venv .venv-py312" >&2
        echo "  .venv-py312/bin/pip install -e geonexus-execution-plane/" >&2
        exit 1
    fi
    PYTHON_BIN="$PYTHON_VENV/bin/python"
    if ! "$PYTHON_BIN" -c "import geonexus" 2>/dev/null; then
        echo "WARN: $PYTHON_BIN 里没有 geonexus-sdk，执行面会启动失败。" >&2
        echo "      pip install geonexus-sdk，或跑 ./setup.sh" >&2
    fi
}

resolve_java
resolve_maven
resolve_python

# 本地 m2 缓存存在就用（可离线），否则退回 Maven 默认位置
if [ -d "$ROOT/tmp/m2-repo" ]; then
    export M2_REPO="$ROOT/tmp/m2-repo"
else
    export M2_REPO="${M2_REPO:-$HOME/.m2/repository}"
fi

mode="${1:-all}"

echo "========================================"
echo " GeoNexus Dev Environment"
echo " Java:    ${JAVA_HOME:-<PATH>}"
echo " Maven:   $(mvn --version 2>/dev/null | head -1)"
echo " Python:  $($PYTHON_BIN --version 2>/dev/null)"
echo "========================================"

start_python() {
    echo ""
    echo ">>> 启动 Python 执行面 (:8787) ..."
    PYTHONPATH="$ROOT/geonexus-execution-plane/src" \
      $PYTHON_BIN - << 'PYEOF' &
from geonexus.geonode import GeoNode
from geonexus_execution_plane.skills import BUILTIN_SKILLS

node = GeoNode(name="execution-plane", port=8787, workdir="/tmp/geonexus-exec")
for s in BUILTIN_SKILLS:
    node.register_skill_object(s)
print("GeoNode at 8787, skills:", [s.name for s in BUILTIN_SKILLS], flush=True)
node.run()  # blocking
PYEOF
    echo $! > "$ROOT/tmp/python.pid"
    echo "    Python 执行面 PID: $(cat "$ROOT/tmp/python.pid")"
    sleep 3
    curl -s http://127.0.0.1:8787/health && echo ""
}

start_java() {
    echo ""
    echo ">>> 启动 Java mgbackend (:8080) ..."
    cd "$ROOT/mgbackend"
    mvn spring-boot:run \
      -Dmaven.repo.local="$M2_REPO" \
      -Dmaven.wagon.http.ssl.insecure=true \
      -Dmaven.wagon.http.ssl.allowall=true \
      > "$ROOT/tmp/mgbackend.log" 2>&1 &
    echo $! > "$ROOT/tmp/java.pid"
    echo "    mgbackend PID: $(cat "$ROOT/tmp/java.pid")"
    echo "    等待启动 (Spring Boot ~15-30s)..."
    for i in $(seq 1 45); do
        if curl -sf http://localhost:8080/mogan/geocard/list > /dev/null 2>&1; then
            echo "    ✅ mgbackend 就绪!"
            curl -s http://localhost:8080/mogan/geocard/list | head -c 400
            echo ""
            return 0
        fi
        sleep 1
    done
    echo "    ⚠️  mgbackend 未就绪，查看日志: tmp/mgbackend.log"
    tail -20 "$ROOT/tmp/mgbackend.log" 2>/dev/null || true
}

run_tests() {
    echo ""
    echo ">>> Python 测试 ..."
    cd "$ROOT/geonexus-execution-plane"
    PYTHONPATH="src" $PYTHON_BIN -m pytest tests/ -q 2>&1 | tail -2

    echo ""
    echo ">>> Java 测试 ..."
    cd "$ROOT/mgbackend"
    mvn test \
      -Dmaven.repo.local="$M2_REPO" \
      -Dmaven.wagon.http.ssl.insecure=true \
      -Dmaven.wagon.http.ssl.allowall=true \
      2>&1 | grep -E "Tests run:.*Failures|BUILD" | tail -3
}

stop_all() {
    echo ">>> 停止所有服务 ..."
    [ -f "$ROOT/tmp/java.pid" ] && kill "$(cat "$ROOT/tmp/java.pid")" 2>/dev/null && rm -f "$ROOT/tmp/java.pid"
    [ -f "$ROOT/tmp/python.pid" ] && kill "$(cat "$ROOT/tmp/python.pid")" 2>/dev/null && rm -f "$ROOT/tmp/python.pid"
    echo "    已停止。"
}

check_env() {
    echo ""
    echo "  工具链解析结果："
    echo "    JAVA_HOME   : ${JAVA_HOME:-<未设置，用 PATH 上的 java>}"
    echo "    mvn         : $(command -v mvn || echo '<未找到>')"
    echo "    M2_REPO     : $M2_REPO"
    echo "    Python      : $PYTHON_BIN ($($PYTHON_BIN --version 2>&1))"
    echo "    geonexus-sdk: $("$PYTHON_BIN" -c 'import geonexus;print(geonexus.__version__)' 2>/dev/null || echo '<未安装>')"
    echo "    Java 版本   : $(java -version 2>&1 | head -1)"
    echo ""
    echo "  可以跑：./dev.sh all | python | java | test | stop"
}

case "$mode" in
    doctor|check) check_env ;;
    python) start_python ;;
    java)   start_java ;;
    stop)   stop_all ;;
    test)   run_tests ;;
    all|*)
        start_python
        start_java
        echo ""
        echo "========================================"
        echo " 🎉 GeoNexus 全部就绪！"
        echo "  Python 执行面: http://127.0.0.1:8787/health"
        echo "  Java mgbackend: http://localhost:8080/mogan/geocard/list"
        echo "  H2 控制台:      http://localhost:8080/h2-console"
        echo "  停止: ./dev.sh stop"
        echo "========================================"
        ;;
esac