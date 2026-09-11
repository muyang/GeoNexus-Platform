"""Execution Plane CLI — 一行命令启动整个执行面。"""

import argparse
import logging
import sys

from .main import ExecutionPlane, PlaneConfig

logger = logging.getLogger("geonexus.execution_plane.cli")


def build_parser(subparsers: argparse._SubParsersAction) -> None:
    """Add ``execution-plane`` subcommand to the geonexus CLI."""
    parser = subparsers.add_parser(
        "execution-plane",
        help="Start the GeoNexus execution plane (GeoMCP + Registry + GeoAgent + OGE)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        description="""
Start the GeoNexus execution plane — a single entry point that bundles:

  • GeoMCP Server          (port 8787) — JSON-RPC 2.0 geospatial protocol
  • Registry                (port 8790) — GeoCard + Skill discovery
  • GeoAgent Runtime       — Pipeline DAG planning + execution
  • OGE Adapter            — OGE OpenAPI protocol conversion
  • Web BFF (optional)     (port 8900) — JWT + SSE + async tasks

All configuration is via environment variables (see --help-env).
""",
    )
    parser.add_argument(
        "--geomcp-port", type=int, default=8787,
        help="GeoMCP server port (env: GEONEXUS_GEOMCP_PORT, default 8787)",
    )
    parser.add_argument(
        "--registry-port", type=int, default=8790,
        help="Registry server port (env: GEONEXUS_REGISTRY_PORT, default 8790)",
    )
    parser.add_argument(
        "--web-port", type=int, default=8900,
        help="Web BFF port (env: GEONEXUS_WEB_PORT, default 8900); set 0 to disable",
    )
    parser.add_argument(
        "--registry-mode", choices=["embedded", "external"], default="embedded",
        help="Registry mode: embedded (start internal) or external (connect to existing)",
    )
    parser.add_argument(
        "--registry-url", default=None,
        help="External registry URL (required when --registry-mode=external)",
    )
    parser.add_argument(
        "--oge-endpoint", default=None,
        help="OGE OpenAPI endpoint (env: GEONEXUS_OGE_ENDPOINT)",
    )
    parser.add_argument(
        "--oge-username", default=None,
        help="OGE account username (env: GEONEXUS_OGE_USERNAME)",
    )
    parser.add_argument(
        "--oge-password", default=None,
        help="OGE account password (env: GEONEXUS_OGE_PASSWORD)",
    )
    parser.add_argument(
        "--oge-client-id", default=None,
        help="OGE OAuth client ID (env: GEONEXUS_OGE_CLIENT_ID)",
    )
    parser.add_argument(
        "--oge-client-secret", default=None,
        help="OGE OAuth client secret (env: GEONEXUS_OGE_CLIENT_SECRET)",
    )
    parser.add_argument(
        "--llm-api-key", default=None,
        help="LLM API key for GeoAgent goal translation (env: GEONEXUS_LLM_API_KEY)",
    )
    parser.add_argument(
        "--llm-base-url", default=None,
        help="LLM base URL (env: GEONEXUS_LLM_BASE_URL, default OpenAI)",
    )
    parser.add_argument(
        "--llm-model", default=None,
        help="LLM model name (env: GEONEXUS_LLM_MODEL, default gpt-4o-mini)",
    )
    parser.add_argument(
        "--node-api-key", default=None,
        help="API key for node-to-node auth (env: GEONEXUS_NODE_API_KEY)",
    )
    parser.add_argument(
        "--workdir", default="/data/geonexus",
        help="Working directory for skill outputs (env: GEONEXUS_WORKDIR)",
    )
    parser.add_argument(
        "--help-env", action="store_true",
        help="Print all supported environment variables and exit",
    )
    parser.add_argument(
        "--log-level", default="INFO",
        choices=["DEBUG", "INFO", "WARNING", "ERROR"],
        help="Logging level (default INFO)",
    )


def cmd_execution_plane(args: argparse.Namespace) -> int:
    """Execute the `execution-plane` subcommand."""
    if getattr(args, "help_env", False):
        _print_env_help()
        return 0

    logging.basicConfig(
        level=getattr(logging, args.log_level),
        format="%(asctime)s | %(levelname)-7s | %(name)s | %(message)s",
        datefmt="%H:%M:%S",
    )

    config = _build_config_from_args(args)
    plane = ExecutionPlane(config)
    try:
        plane.start()
        plane.wait()
    except KeyboardInterrupt:
        print("\nShutting down...")
        plane.stop()
    return 0


def _build_config_from_args(args: argparse.Namespace) -> PlaneConfig:
    """Merge CLI args and environment variables into PlaneConfig."""
    import os

    env = os.environ.get
    return PlaneConfig(
        geomcp_port=args.geomcp_port,
        registry_port=args.registry_port,
        web_port=args.web_port,
        registry_mode=args.registry_mode,
        registry_url=args.registry_url or env("GEONEXUS_REGISTRY_URL"),
        oge_endpoint=args.oge_endpoint or env("GEONEXUS_OGE_ENDPOINT"),
        oge_username=args.oge_username or env("GEONEXUS_OGE_USERNAME"),
        oge_password=args.oge_password or env("GEONEXUS_OGE_PASSWORD"),
        oge_client_id=args.oge_client_id or env("GEONEXUS_OGE_CLIENT_ID"),
        oge_client_secret=args.oge_client_secret or env("GEONEXUS_OGE_CLIENT_SECRET"),
        llm_api_key=args.llm_api_key or env("GEONEXUS_LLM_API_KEY"),
        llm_base_url=args.llm_base_url or env("GEONEXUS_LLM_BASE_URL"),
        llm_model=args.llm_model or env("GEONEXUS_LLM_MODEL", "gpt-4o-mini"),
        node_api_key=args.node_api_key or env("GEONEXUS_NODE_API_KEY", "default-node-key"),
        workdir=args.workdir or env("GEONEXUS_WORKDIR", "/data/geonexus"),
    )


def _print_env_help() -> None:
    print("""GeoNexus Execution Plane — Environment Variables

  Core
    GEONEXUS_GEOMCP_PORT       GeoMCP server port (default 8787)
    GEONEXUS_REGISTRY_PORT     Registry server port (default 8790)
    GEONEXUS_REGISTRY_URL      External registry URL (optional)
    GEONEXUS_NODE_API_KEY      API key for node-to-node auth
    GEONEXUS_WORKDIR           Working directory (default /data/geonexus)

  OGE OpenAPI
    GEONEXUS_OGE_ENDPOINT      OGE API gateway URL
    GEONEXUS_OGE_USERNAME      OGE login username
    GEONEXUS_OGE_PASSWORD      OGE login password
    GEONEXUS_OGE_CLIENT_ID     OGE OAuth client ID
    GEONEXUS_OGE_CLIENT_SECRET OGE OAuth client secret

  LLM (GeoAgent goal translation)
    GEONEXUS_LLM_API_KEY       LLM API key
    GEONEXUS_LLM_BASE_URL      LLM base URL (default OpenAI)
    GEONEXUS_LLM_MODEL         LLM model name (default gpt-4o-mini)
""")