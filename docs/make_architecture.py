#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""绘制 GeoNexus 架构图 —— 心脏 / 大脑 / 手脚 / 资源。

    GeoNexus-SDK      心脏    协议内核：契约与执行从这里泵出去（第三方也可直接用）
    GeoKG             大脑    可独立、可外挂在 SDK 上、也可被第三方直接接入（可插拔）
    GeoNexus-Platform 手脚    基于 RuoYi 的前后端 Web 系统（门户 + 莫干地球系统），身份/权限在此
    OGE               资源    默认 GeoNode 解决方案（存算资源服务），非唯一资源节点

排版原则：主列自上而下分层，箭头只连相邻层，第三方走右侧走廊 —— 保证没有箭头穿过盒子。
输出：docs/images/platform-architecture.png
"""

from __future__ import annotations

import os
import pathlib

HERE = pathlib.Path(__file__).resolve().parent
os.environ.setdefault("MPLCONFIGDIR", str(HERE / ".mplcache"))

import matplotlib
matplotlib.use("Agg")
from matplotlib import font_manager, pyplot as plt
from matplotlib.patches import FancyArrowPatch, FancyBboxPatch

for _f in ["/System/Library/Fonts/Hiragino Sans GB.ttc",
           "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
           "/System/Library/Fonts/PingFang.ttc"]:
    if pathlib.Path(_f).exists():
        font_manager.fontManager.addfont(_f)
plt.rcParams["font.sans-serif"] = ["Hiragino Sans GB", "Arial Unicode MS",
                                   "PingFang HK", "Songti SC"]
plt.rcParams["axes.unicode_minus"] = False

OUT = HERE / "images" / "platform-architecture.png"

C = {
    "third":   ("#F7F7F7", "#9E9E9E"),
    "plat":    ("#F2F7FC", "#4E79A7"),
    "front":   ("#E8F1FB", "#4E79A7"),
    "back":    ("#EDF3FA", "#4E79A7"),
    "sdk":     ("#E4F4E8", "#2F8F4A"),
    "geokg":   ("#F5EEF9", "#8E5BA6"),
    "ogenode": ("#FDF1EC", "#C8553D"),
    "nodeN":   ("#FAFAFA", "#BBBBBB"),
    "infra":   ("#F2F2F2", "#9E9E9E"),
}


def box(ax, x, y, w, h, title="", items=(), kind="plat", *, title_size=11.5,
        item_size=8.4, dashed=False, lw=1.5, align="left", gap=1.15):
    fill, edge = C[kind]
    ax.add_patch(FancyBboxPatch(
        (x, y), w, h, boxstyle="round,pad=0.28,rounding_size=0.6",
        linewidth=lw, edgecolor=edge, facecolor=fill, zorder=2,
        linestyle=(0, (6, 3)) if dashed else "-"))
    top = y + h - 0.85
    if title:
        n = title.count("\n") + 1
        ax.text(x + w / 2, top, title, ha="center", va="top", fontsize=title_size,
                fontweight="bold", color="#17324F", zorder=3, linespacing=1.5)
        top -= n * title_size * 0.175 + gap
    if items:
        ha = "left" if align == "left" else "center"
        tx = x + 1.2 if align == "left" else x + w / 2
        ax.text(tx, top, "\n".join(items), ha=ha, va="top", fontsize=item_size,
                color="#333333", linespacing=1.62, zorder=3)


def arrow(ax, p1, p2, label="", *, color="#4A4A4A", lw=1.6, style="-",
          rad=0.0, ldx=0.0, ldy=0.0, lsize=8.0, ha="center"):
    ls = {"=": (0, (5, 2)), "-": "-", ".": (0, (1, 2))}[style]
    ax.add_patch(FancyArrowPatch(p1, p2, arrowstyle="-|>", mutation_scale=14,
                                 linewidth=lw, color=color, linestyle=ls, zorder=5,
                                 connectionstyle=f"arc3,rad={rad}", shrinkA=2, shrinkB=2))
    if label:
        ax.text((p1[0] + p2[0]) / 2 + ldx, (p1[1] + p2[1]) / 2 + ldy, label,
                ha=ha, va="center", fontsize=lsize, color=color, zorder=6,
                bbox=dict(boxstyle="round,pad=0.24", fc="white", ec="none", alpha=0.95))


def elbow(ax, pts, *, color="#9E9E9E", lw=1.5, ls=(0, (5, 2))):
    """折线走廊：前几段直线，最后一段带箭头。"""
    for i in range(len(pts) - 2):
        ax.plot([pts[i][0], pts[i + 1][0]], [pts[i][1], pts[i + 1][1]],
                color=color, lw=lw, ls=ls, zorder=5, solid_capstyle="round")
    ax.add_patch(FancyArrowPatch(pts[-2], pts[-1], arrowstyle="-|>", mutation_scale=13,
                                 linewidth=lw, color=color, linestyle=ls, zorder=5))


fig, ax = plt.subplots(figsize=(17.6, 14.8), dpi=170)
ax.set_xlim(0, 100)
ax.set_ylim(0, 100)
ax.axis("off")

ax.text(50, 99.6, "GeoNexus 架构：心脏 · 大脑 · 手脚 · 资源",
        ha="center", va="top", fontsize=20, fontweight="bold", color="#1F4E79")
ax.text(50, 96.7,
        "SDK 是心脏（协议内核）· GeoKG 是大脑（可插拔、可独立、第三方可接入）· "
        "Platform 是手脚（RuoYi 前后端实现）· OGE 是默认资源节点（非唯一）",
        ha="center", va="top", fontsize=10.5, color="#555555")

LX, RX = 1.5, 86.0          # 主列左右边界；右侧 86–99.5 为第三方走廊

# ── ① 第三方（可选）──────────────────────────────────────────────────────
box(ax, LX, 86.8, RX - LX, 7.2,
    "① 第三方（可选）· 第三方平台 / 第三方 GeoNode",
    ["· 接入 SDK 协议（GeoMCP / GeoCard）→ 复用心脏     "
     "· 接入 GeoKG 知识（检索 / 子图 API）→ 复用大脑     "
     "· 或仅作为独立 GeoNode 加入联邦（不依赖本平台）"],
    "third", title_size=11, item_size=8.6, dashed=True)

# ── ② GeoNexus-Platform（手脚 / 躯体）────────────────────────────────────
box(ax, LX, 57.6, RX - LX, 28.4, "", (), "plat", lw=2.2)
ax.text(50, 85.2, "② GeoNexus-Platform ＝ 手脚 / 躯体（基于 RuoYi 的前后端 Web 系统）",
        ha="center", va="top", fontsize=13.5, fontweight="bold", color="#1F4E79")
ax.text(50, 82.9, "把心脏的能力长成用户可用的产品：全球门户（公众）＋ 莫干地球系统（机构）",
        ha="center", va="top", fontsize=9.6, color="#4E79A7")

box(ax, 3.5, 72.4, 81.0, 8.2, "前端 · RuoYi-Vue3",
    ["全球门户：1.可视化地球 · 2.全球案例 · 3.数据资源 · 4.算子模型 · 5.算力平台 · 6.开放社区 · 7.超级智能体 · 8.典型应用",
     "莫干地球系统：1.首页 · 2.GeoCard · 3.案例中心 · 4.智能工作台 · 5.个人中心 · 6.运维管理（后台管理系统）"],
    "front", title_size=10.5, item_size=8.3)

box(ax, 3.5, 59.0, 81.0, 11.4, "后端 · RuoYi（Spring Boot + Security + MyBatis）",
    ["身份与权限：sys_user / sys_dept / sys_role / sys_menu · 数据权限 · 配额（Quota）→ 签发 RS256 JWT（JWKS）",
     "业务服务：目录发布 · 案例中心 · 工作台编排 · 个人中心（聚合视图，不建用户表）· 审批流 · 运营看板",
     "集成与审计：GeoMCP 客户端（调心脏）· GeoCard 变更同步 · OGE 凭证下发 · 任务与审计回写（mogan_audit）"],
    "back", title_size=10.5, item_size=8.3)

# ── ③ 心脏 + 大脑 ────────────────────────────────────────────────────────
box(ax, LX, 28.6, 55.5, 27.0, "GeoNexus-SDK（心脏 · 协议内核）",
    ["· GeoCard 契约（7 类，含 knowledge）/ GeoMCP 协议（含 geo.invoke）",
     "· Registry 发现 · GAAG 契约门禁 · GeoSkill 能力模型",
     "· GeoTask / Scheduler：就绪集并行 · 容量准入 · 重试退避",
     "· CAFE 唯一下推引擎 · ModelProvider（模型可调用）",
     "· GeoAgent 编排（DAG + 反射自修复）",
     "· GeoNode 抽象 + Runtime（本地执行面）",
     "",
     "本质是协议内核：不含业务数据、不含账号；",
     "第三方平台可像本平台一样直接内嵌或对接它。"],
    "sdk", title_size=13, item_size=8.5, lw=2.4)

box(ax, 60.0, 28.6, 26.0, 27.0, "GeoKG（大脑 · 知识图谱）",
    ["· 实体 / 关系 · L1–L3 本体",
     "· 强制溯源：origin /",
     "  source / source_tier /",
     "  license / retrieved",
     "· 检索 · 子图 · 类型 API",
     "· 图谱可视化 /ui",
     "· 数据集版本 + 陈旧度告警",
     "",
     "以 knowledge 类 GeoCard 挂载进",
     "SDK；可独立部署；也可被第三方",
     "平台直接接入（不经本平台）"],
    "geokg", title_size=13, item_size=8.5, lw=2.4)

# 外挂连接（SDK ←→ GeoKG）
arrow(ax, (57.0, 42.1), (60.0, 42.1), "", color="#8E5BA6", lw=2.4, style="=")
ax.text(58.5, 42.1, "外挂（可插拔）", ha="center", va="center", fontsize=7.8,
        color="#8E5BA6", fontweight="bold", rotation=90)

# ── ④ 资源层：OGE 是独立系统 ─────────────────────────────────────────────
ax.text(LX, 26.2, "④ 资源层：OGE 是**独立系统**（自有前后端与注册），本平台消费其后端能力"
        .replace("**", ""), fontsize=11, fontweight="bold", color="#1F4E79")

box(ax, LX, 12.6, 56.5, 11.8, "OGE（独立系统 · 资源平台）",
    ["前端：OGE 门户 / 控制台（用 OGE 自有账号登录）        ← 本平台不嵌入、不代理",
     "账号：OGE 自有用户注册系统 —— 这就是 OGE 账号域，与本平台账号域相互独立",
     "后端能力（本平台主要消费）：1.首页（资源规模）· 2.数据中心 · 3.计算中心 · 4.AI中心（解译库/样本库）",
     "      5.知识中心（节点本地知识库·检索问答）· 6.管理中心（资源/服务/开发）· 7.国产化适配",
     "      对外接口：OpenAPI（算法执行 / 任务轮询 / 结果下载）+ OGC API",
     "两个账号域不做联邦：本平台用户无需在 OGE 注册，能力由平台代表用户调用并记账"],
    "ogenode", title_size=12, item_size=8.3, lw=2.2)

box(ax, 60.0, 16.4, 26.0, 8.0, "接入桥接（本平台侧）",
    ["· GeoNode 外壳：GeoCard 注册 · GeoMCP 端点 · OPA 策略 · 审计",
     "· OGE Adapter：凭证托管 mogan_oge_credential（加密）→ 换 tk",
     "· 平台代表用户调用并记账：配额与审计落在平台侧"],
    "sdk", title_size=10.5, item_size=8.2)

box(ax, 60.0, 13.2, 26.0, 2.6, "",
    ["· 其他 / 第三方 GeoNode（未来接入）：经 GeoMCP 入联邦，平台不改代码即可注册"],
    "nodeN", item_size=8.1, dashed=True)

# ── ⑤ 数据供给与底座 ─────────────────────────────────────────────────────
box(ax, LX, 5.6, 46.5, 6.0, "公共产品治理（数据就绪 · 数据供给）",
    ["· 1.地理信息数据治理（张楠）：全球影像 / 地形 / POI / 矢量切片    "
     "· 2.公共产品数据治理（高镇）：地表 / 人口 / 医疗 / 教育 / 夜光数据集",
     "· 3.公共产品服务发布（张楠）：产出注册为 GeoCard（经平台目录）并落到节点存储"],
    "front", title_size=10.5, item_size=8.2)

box(ax, 50.0, 5.6, 36.0, 6.0, "基础设施底座",
    ["对象存储（栅格 / 矢量 / 成果）· PostgreSQL + PostGIS / pgvector",
     "图存储（gzip+NDJSON / Neo4j）· K8s + GPU 集群 / 国产化算力"],
    "infra", title_size=10.5, item_size=8.4)

# ── 箭头（只连相邻层，互不穿越；标签全部落在层间空白带）──────────────────
arrow(ax, (25.0, 86.8), (25.0, 85.9), "", color="#9E9E9E", lw=1.5, style="=")
arrow(ax, (40.0, 72.4), (40.0, 70.6), "HTTP / SSE（RuoYi JWT 鉴权）",
      color="#4E79A7", lw=1.8, ldx=17.0, lsize=8)
arrow(ax, (20.0, 59.0), (20.0, 56.2), "调用 SDK 能力（契约 + 执行）",
      color="#2F8F4A", lw=2.0, ldx=17.0, lsize=8)
arrow(ax, (47.0, 59.0), (47.0, 56.2), "JWT 校验（JWKS）",
      color="#E8A33D", lw=1.5, style="=", ldx=13.5, lsize=8)
arrow(ax, (20.0, 28.6), (20.0, 24.6), "GeoMCP ＋ OGE Adapter（凭证托管换 tk）",
      color="#2F8F4A", lw=2.0, style="-", ldx=22.0, lsize=8)
arrow(ax, (40.0, 28.6), (40.0, 24.6), "JWT / 服务令牌",
      color="#E8A33D", lw=1.5, style="=", ldx=20.0, lsize=8)
arrow(ax, (18.0, 12.2), (18.0, 11.8), "", color="#4E79A7", lw=1.5)

# 右侧走廊：第三方直接接入大脑（绕开平台，不穿任何盒子）
elbow(ax, [(86.0, 89.8), (95.0, 89.8), (95.0, 42.1), (86.2, 42.1)], color="#8E5BA6", lw=1.5)
ax.text(90.8, 88.2, "第三方直接\n接入 GeoKG\n（不经平台）", ha="center", va="top",
        fontsize=7.6, color="#8E5BA6", linespacing=1.5)

# 边界提示：两处"知识中心"不是一回事；两个账号域也不做联邦
ax.text(LX, 3.9, "注 1：OGE「5.知识中心」是节点本地知识库与检索问答（随节点走）；"
                 "GeoKG 是全局领域知识图谱（大脑）。两者分层不同，不是同一份知识。",
        fontsize=8.2, color="#8E5BA6", va="bottom")
ax.text(LX, 2.1, "注 2：两个账号域相互独立、不做联邦 —— 本平台用户无需在 OGE 注册；"
                 "若某单位需在 OGE 侧独立开户，由平台管理员代理开户并记录映射，禁止用户自行注册形成影子账号。",
        fontsize=8.2, color="#C00000", va="bottom")

# ── 图例 ─────────────────────────────────────────────────────────────────
x0 = 2.0
for style, color, label in [("-", "#2F8F4A", "SDK 契约 / 执行"), ("=", "#8E5BA6", "外挂（可插拔）"),
                            ("=", "#E8A33D", "身份令牌"), ("=", "#9E9E9E", "第三方接入"),
                            ("-", "#4E79A7", "平台内部调用")]:
    ax.add_patch(FancyArrowPatch((x0, 0.4), (x0 + 3.0, 0.4), arrowstyle="-|>",
                                 mutation_scale=11, linewidth=1.6, color=color,
                                 linestyle={"=": (0, (5, 2))}.get(style, "-"), zorder=5))
    ax.text(x0 + 3.6, 0.4, label, fontsize=8.6, va="center", color="#333333")
    x0 += 16.5

fig.tight_layout(rect=(0.004, 0.004, 0.996, 0.996))
fig.savefig(OUT, dpi=170, facecolor="white")
print(f"✅ 已生成 {OUT.name}（{OUT.stat().st_size // 1024} KB）")
