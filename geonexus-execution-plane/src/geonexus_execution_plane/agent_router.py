"""执行面 Agent REST helper — 封装 DataAgent 供 Java mgbackend 调用。

在 GeoMCP GeoNode 启动后，通过 FastAPI app 挂载 /api/agent/* 路由。
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter
from geonexus.agent.data_agent import DataAgent
from geonexus.gaag import ContractGate, GAAGRegistry

logger = logging.getLogger("geonexus.execution_plane.agent_router")

# 全局 DataAgent 实例（在 execution_plane main 中初始化时设置）
_agent: DataAgent | None = None


def init_agent(registry: GAAGRegistry | None = None, node_id: str = "execution-plane") -> DataAgent:
    """初始化或获取 DataAgent 单例。"""
    global _agent
    if _agent is not None:
        return _agent
    if registry is None:
        registry = GAAGRegistry()
    gate = ContractGate(semantic_threshold=0.15)
    _agent = DataAgent(registry=registry, gate=gate, node_id=node_id)
    return _agent


def get_agent() -> DataAgent:
    if _agent is None:
        raise RuntimeError("DataAgent not initialized. Call init_agent() first.")
    return _agent


def create_agent_router() -> APIRouter:
    """创建 FastAPI router，挂载到 /api/agent/*。

    供 Java mgbackend 通过 REST 调用：
    - POST /api/agent/discover  — 自然语言语义搜索合约
    - POST /api/agent/bind     — 合约绑定 + 计算下推决策
    """
    router = APIRouter(prefix="/api/agent", tags=["agent"])

    @router.post("/discover")
    def discover(body: dict[str, Any]) -> dict[str, Any]:
        """DataAgent 语义搜索。

        Request: {"intent": "mekong flood", "k": 5}
        Response: {"contracts": [...], "count": N}
        """
        agent = get_agent()
        intent = body.get("intent", "")
        k = body.get("k", 5)
        if not intent:
            return {"error": "intent is required", "contracts": [], "count": 0}
        contracts = agent.discover(intent, k=k)
        return {
            "intent": intent,
            "contracts": [c.to_dict() for c in contracts],
            "count": len(contracts),
        }

    @router.post("/bind")
    def bind(body: dict[str, Any]) -> dict[str, Any]:
        """DataAgent 合约绑定 + 计算决策。

        Request: {
            "intent": "mekong flood water extent",
            "bbox": [-5, -2, 5, 2],
            "crs": "EPSG:4326"
        }
        Response: {
            "gate_passed": bool,
            "bound_contract": {...},
            "compute_decision": "local|migrate",
            "explanation": "..."
        }
        """
        agent = get_agent()
        intent = body.get("intent", "")
        bbox = body.get("bbox")
        crs = body.get("crs")
        required_bands = body.get("required_bands")
        if not intent:
            return {"error": "intent is required", "gate_passed": False}
        decision = agent.bind(
            intent,
            bbox=bbox,
            crs=crs,
            required_bands=required_bands,
        )
        return decision.to_dict()

    @router.post("/register")
    def register(body: dict[str, Any]) -> dict[str, Any]:
        """注册一个 GAAG 合约。

        Request: {"path": "/path/to/raster.tif", "description": "Mekong flood map"}
        """
        from pathlib import Path

        from geonexus.gaag.embed import embed_text

        agent = get_agent()
        registry = agent.registry
        path = body.get("path", "")
        description = body.get("description", "")
        if not path:
            return {"error": "path is required", "registered": False}
        contract = registry.register_asset(
            path,
            description=description or Path(path).stem,
        )
        contract.semantic_embedding = embed_text(description or Path(path).stem)
        contract.provenance = f"local:{Path(path).name}"
        return {"registered": True, "contract": contract.to_dict(), "total": registry.count()}

    @router.get("/health")
    def health() -> dict[str, Any]:
        """健康检查。"""
        agent = get_agent()
        return {
            "status": "ok",
            "agent_ready": True,
            "registry_count": agent.registry.count(),
        }

    return router