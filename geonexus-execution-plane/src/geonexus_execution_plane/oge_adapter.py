"""GeoNexus Execution Plane — OGE 适配器集成。

使用 geonexus-sdk 的 OGE 适配器模块，将 OGE 算子注册为 GeoSkill。
Java 团队不需要关心 OGE 协议细节，只需通过 GeoMCP 调用。
"""

from __future__ import annotations

import logging
from typing import Any

from geonexus.adapters.oge_credential import OgeCredential
from geonexus.adapters.oge_skill import OgeSkillAdapter, discover_oge_skills
from geonexus.geonode import Skill

logger = logging.getLogger("geonexus.execution_plane.oge")


class OgeAdapter:
    """OGE 适配器 — 封装 SDK 的 OGE 适配模块。

    将 OGE 算子包装为 GeoSkill，注册到执行面的 Skill Registry。
    """

    def __init__(self, endpoint: str | None = None,
                 username: str | None = None,
                 password: str | None = None,
                 client_id: str | None = None,
                 client_secret: str | None = None,
                 api_key: str = "default") -> None:
        self.credential = OgeCredential(
            endpoint=endpoint or "http://openge.org.cn/api",
            username=username or "",
            password=password or "",
            client_id=client_id or "test",
            client_secret=client_secret or "123456",
        ) if all([endpoint, username, password]) else None

    @property
    def is_configured(self) -> bool:
        return self.credential is not None and bool(self.credential.username)

    def load_skills(self) -> list[Skill]:
        """从 OGE 发现算子并返回 GeoSkill 列表。

        如果 OGE 未配置，返回空列表。
        如果 OGE 不可达，回退到已知算子映射表。
        """
        if not self.is_configured:
            logger.info("OGE: not configured, skipping OGE skill discovery")
            return []

        try:
            skills = discover_oge_skills(credential=self.credential)
            logger.info("OGE: discovered %d skills from OGE platform", len(skills))
            return skills
        except Exception as exc:
            logger.warning("OGE: discovery failed, falling back to built-in map: %s", exc)
            # 使用 SDK 内置的已知算子映射
            adapter = OgeSkillAdapter(credential=self.credential)
            return adapter.discover_skills()