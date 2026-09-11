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
export JAVA_HOME="$ROOT/.jdk17/jdk-17.0.2.jdk/Contents/Home"
export PATH="$JAVA_HOME/bin:$ROOT/.maven/libexec/bin:$PATH"
export M2_REPO="$ROOT/tmp/m2-repo"

PYTHON_VENV="$ROOT/.venv-py39"

mode="${1:-all}"

echo "========================================"
echo " GeoNexus Dev Environment"
echo " Java:    $JAVA_HOME"
echo " Maven:   $(mvn --version 2>/dev/null | head -1)"
echo " Python:  $($PYTHON_VENV/bin/python --version 2>/dev/null)"
echo "========================================"

start_python() {
    echo ""
    echo ">>> 启动 Python 执行面 (:8787) ..."
    PYTHONPATH="$ROOT/geonexus-execution-plane/src:$ROOT/mvp/src" \
      $PYTHON_VENV/bin/python - << 'PYEOF' &
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
    PYTHONPATH="src:$ROOT/mvp/src" $PYTHON_VENV/bin/python -m pytest tests/ -q 2>&1 | tail -2

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

case "$mode" in
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