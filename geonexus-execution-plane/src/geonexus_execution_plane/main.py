"""GeoNexus Execution Plane — 核心编排器。

一行启动所有组件：
  GeoMCP Server + Registry + GeoAgent + OGE Adapter + Web BFF
"""

from __future__ import annotations

import logging
import os
import signal
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

logger = logging.getLogger("geonexus.execution_plane")


@dataclass
class PlaneConfig:
    """执行面配置 — 全部通过环境变量或 CLI 参数注入。"""

    # GeoMCP
    geomcp_port: int = 8787

    # Registry
    registry_port: int = 8790
    registry_mode: str = "embedded"  # "embedded" | "external"
    registry_url: str | None = None

    # Web BFF (0 = disable)
    web_port: int = 8900

    # OGE
    oge_endpoint: str | None = None
    oge_username: str | None = None
    oge_password: str | None = None
    oge_client_id: str | None = None
    oge_client_secret: str | None = None

    # LLM
    llm_api_key: str | None = None
    llm_base_url: str | None = None
    llm_model: str = "gpt-4o-mini"

    # Node auth
    node_api_key: str = "default-node-key"

    # Working directory
    workdir: str = "/data/geonexus"


class ExecutionPlane:
    """执行面实例 — 编排所有组件启动、运行、停止。"""

    def __init__(self, config: PlaneConfig) -> None:
        self.config = config
        self._threads: list[threading.Thread] = []
        self._servers: list[Any] = []
        self._registry: Any = None
        self._node: Any = None
        self._node_name: str = "execution-plane"

        # 确保工作目录存在
        Path(config.workdir).mkdir(parents=True, exist_ok=True)

        # 注册信号处理
        signal.signal(signal.SIGINT, self._signal_handler)
        signal.signal(signal.SIGTERM, self._signal_handler)

    # ──────────────── 启动 ────────────────

    def start(self) -> None:
        """按顺序启动所有组件。"""
        logger.info("Starting GeoNexus Execution Plane v%s",
                     getattr(self, "__version__", "1.0.0"))
        logger.info("  Workdir : %s", self.config.workdir)
        logger.info("  Registry: mode=%s port=%d",
                     self.config.registry_mode, self.config.registry_port)
        logger.info("  GeoMCP  : port=%d", self.config.geomcp_port)
        if self.config.oge_endpoint:
            logger.info("  OGE     : %s", self.config.oge_endpoint)
        if self.config.web_port:
            logger.info("  Web BFF : port=%d", self.config.web_port)

        # 1. Registry
        registry_url = self._start_registry()

        # 2. GeoNode (GeoMCP Server + Runtime + Skills)
        self._start_geonode(registry_url)

        # 3. Web BFF (optional)
        if self.config.web_port:
            self._start_web_bff(registry_url)

        # 4. Print ready
        self._print_ready()

    # ──────────────── 组件启动 ────────────────

    def _start_registry(self) -> str:
        """启动 Registry（内嵌或连接外部），返回 registry URL。"""
        if self.config.registry_mode == "external":
            url = self.config.registry_url
            if not url:
                raise ValueError("--registry-url required when mode=external")
            logger.info("Connecting to external registry: %s", url)
            return url

        # 内嵌 Registry
        from geonexus.registry import RegistryServer  # noqa: PLC0415

        persist_path = Path(self.config.workdir) / "registry.json"
        self._registry = RegistryServer(
            name="execution-plane-registry",
            persist_path=str(persist_path),
            api_keys={self.config.node_api_key} if self.config.node_api_key else None,
        )
        app = self._registry.create_app()
        url = f"http://127.0.0.1:{self.config.registry_port}"

        self._serve(app, self.config.registry_port, "Registry")
        logger.info("Registry started: %s (persist=%s)", url, persist_path)
        return url

    def _start_geonode(self, registry_url: str) -> None:
        """启动 GeoNode（含 GeoMCP Server + Skills + OGE Adapter）。"""
        from geonexus.geonode import GeoNode  # noqa: PLC0415

        self._node = GeoNode(
            name=self._node_name,
            host="0.0.0.0",
            port=self.config.geomcp_port,
            workdir=self.config.workdir,
        )

        # 注册内建技能
        self._register_builtin_skills()

        # 注册 OGE 技能（如果配置了 OGE）
        if self.config.oge_endpoint:
            self._register_oge_skills()

        # 广告到 Registry
        self._node.advertise(registry_url,
                             endpoint=f"http://0.0.0.0:{self.config.geomcp_port}")

        # 启动 GeoMCP Server
        self._node.run()
        logger.info("GeoMCP Server started: http://127.0.0.1:%d/geomcp",
                     self.config.geomcp_port)

    def _register_builtin_skills(self) -> None:
        """注册执行面内建技能。"""
        from .skills import BUILTIN_SKILLS  # noqa: PLC0415

        for skill_def in BUILTIN_SKILLS:
            self._node.register_skill_object(skill_def)
            logger.info("  Skill registered: %s", skill_def.name)

    def _register_oge_skills(self) -> None:
        """注册 OGE 适配技能（从 OGE 算子定义自动生成 Skill 和 GeoCard）。"""
        from .oge_adapter import OgeAdapter  # noqa: PLC0415

        adapter = OgeAdapter(
            endpoint=self.config.oge_endpoint,
            username=self.config.oge_username,
            password=self.config.oge_password,
            client_id=self.config.oge_client_id,
            client_secret=self.config.oge_client_secret,
            api_key=self.config.node_api_key,
        )
        skills = adapter.load_skills()
        for skill in skills:
            self._node.register_skill_object(skill)
            logger.info("  OGE Skill registered: %s", skill.name)

    def _start_web_bff(self, registry_url: str) -> None:
        """启动 Web BFF（JWT + SSE + 异步任务）。"""
        from geonexus.web import JWTConfig, WebConfig, create_web_app  # noqa: PLC0415

        jwt_secret = os.environ.get("GEONEXUS_JWT_SECRET", "development-secret-change-in-production")
        config = WebConfig(
            registry_url=registry_url,
            jwt=JWTConfig(secret=jwt_secret),
            node_api_keys={f"http://127.0.0.1:{self.config.geomcp_port}": self.config.node_api_key},
            default_node_url=f"http://127.0.0.1:{self.config.geomcp_port}",
            llm=self._llm_config(),
        )
        app = create_web_app(config, cors_origins=["*"])
        self._serve(app, self.config.web_port, "Web BFF")
        logger.info("Web BFF started: http://127.0.0.1:%d", self.config.web_port)

    def _llm_config(self) -> Any:
        """构造 LLM 配置（如果配置了 API key）。"""
        if not self.config.llm_api_key:
            return None
        from geonexus.agent import LLMConfig  # noqa: PLC0415
        return LLMConfig(
            base_url=self.config.llm_base_url or "https://api.openai.com/v1",
            api_key=self.config.llm_api_key,
            model=self.config.llm_model,
        )

    # ──────────────── 工具方法 ────────────────

    def _serve(self, app: Any, port: int, name: str) -> None:
        """在后台线程中启动 uvicorn server。"""
        import uvicorn  # noqa: PLC0415

        config = uvicorn.Config(app, host="0.0.0.0", port=port, log_level="warning")
        server = uvicorn.Server(config)
        thread = threading.Thread(target=server.run, daemon=True, name=name)
        thread.start()
        self._threads.append(thread)
        self._servers.append(server)

    def _print_ready(self) -> None:
        """打印就绪信息。"""
        geomcp = f"http://127.0.0.1:{self.config.geomcp_port}"
        registry = f"http://127.0.0.1:{self.config.registry_port}"
        print(f"""
╔══════════════════════════════════════════════════════╗
║       GeoNexus Execution Plane — Ready              ║
╠══════════════════════════════════════════════════════╣
║  GeoMCP  : {geomcp:<47}║
║  Registry: {registry:<47}║
║  Workdir : {self.config.workdir:<47}║
╠══════════════════════════════════════════════════════╣
║  Try:                                                 ║
║    curl {geomcp}/health                          ║
║    curl {geomcp}/capabilities                    ║
║    curl -X POST {geomcp}/geomcp \\               ║
║      -H 'Content-Type: application/json' \\           ║
║      -d '{{"jsonrpc":"2.0","id":"1","method":         ║
║            "geo.capabilities","params":{{}}}}'          ║
╚══════════════════════════════════════════════════════╝
""")

    # ──────────────── 停止 ────────────────

    def _signal_handler(self, signum: int, _frame: Any) -> None:
        logger.info("Received signal %d, shutting down...", signum)
        self.stop()

    def stop(self) -> None:
        """优雅停止所有组件。"""
        for server in self._servers:
            server.should_exit = True
        logger.info("All components stopped.")

    def wait(self) -> None:
        """阻塞直到收到退出信号。"""
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            self.stop()

    # ──────────────── 便捷入口 ────────────────

    @classmethod
    def from_env(cls) -> ExecutionPlane:
        """从环境变量创建配置并启动。"""
        import os
        cfg = PlaneConfig(
            geomcp_port=int(os.environ.get("GEONEXUS_GEOMCP_PORT", "8787")),
            registry_port=int(os.environ.get("GEONEXUS_REGISTRY_PORT", "8790")),
            web_port=int(os.environ.get("GEONEXUS_WEB_PORT", "8900")),
            registry_mode=os.environ.get("GEONEXUS_REGISTRY_MODE", "embedded"),
            registry_url=os.environ.get("GEONEXUS_REGISTRY_URL"),
            oge_endpoint=os.environ.get("GEONEXUS_OGE_ENDPOINT"),
            oge_username=os.environ.get("GEONEXUS_OGE_USERNAME"),
            oge_password=os.environ.get("GEONEXUS_OGE_PASSWORD"),
            oge_client_id=os.environ.get("GEONEXUS_OGE_CLIENT_ID"),
            oge_client_secret=os.environ.get("GEONEXUS_OGE_CLIENT_SECRET"),
            llm_api_key=os.environ.get("GEONEXUS_LLM_API_KEY"),
            llm_base_url=os.environ.get("GEONEXUS_LLM_BASE_URL"),
            llm_model=os.environ.get("GEONEXUS_LLM_MODEL", "gpt-4o-mini"),
            node_api_key=os.environ.get("GEONEXUS_NODE_API_KEY", "default-node-key"),
            workdir=os.environ.get("GEONEXUS_WORKDIR", "/data/geonexus"),
        )
        return cls(cfg)


# ──────────────── 独立入口 ────────────────

def main() -> None:
    """从环境变量启动执行面（用于 Docker entrypoint）。"""
    logging.basicConfig(
        level=os.environ.get("GEONEXUS_LOG_LEVEL", "INFO").upper(),
        format="%(asctime)s | %(levelname)-7s | %(name)s | %(message)s",
        datefmt="%H:%M:%S",
    )
    plane = ExecutionPlane.from_env()
    plane.start()
    plane.wait()


if __name__ == "__main__":
    main()