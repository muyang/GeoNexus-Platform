#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""绘制「用户管理模块设计图」：账号 · 注册 · 权限 · 个人中心。

与 docs/user-management.md 同源同义；视觉语言与 platform-architecture.png 一致。

版面预算（画布 17.6in × 15.0in，y 轴 0–100）：
    1 单位 = 10.8pt；正文 8.2pt/行距 1.62 → 每行 1.23 单位；11pt 标题行 1.53 单位
    box 所需高度 ≈ 0.85 + 标题行 + 1.15 + 1.23×正文行数 + 0.85
按实测值排版，避免文字溢出盒子（此前按 1.5 单位估算，导致溢出重叠）。

输出：docs/images/user-management.png
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

OUT = HERE / "images" / "user-management.png"

C = {
    "entry":   ("#F7F7F7", "#9E9E9E"),
    "account": ("#FFF4E5", "#E8A33D"),
    "token":   ("#FFF9EF", "#E8A33D"),
    "perm1":   ("#E8F1FB", "#4E79A7"),
    "perm2":   ("#E4F4E8", "#2F8F4A"),
    "perm3":   ("#FDF1EC", "#C8553D"),
    "center":  ("#F2F7FC", "#4E79A7"),
    "admin":   ("#EDF3FA", "#4E79A7"),
    "server":  ("#F5EEF9", "#8E5BA6"),
    "ogenode": ("#FDF1EC", "#C8553D"),
    "audit":   ("#F2F2F2", "#9E9E9E"),
}


def box(ax, x, y, w, h, title="", items=(), kind="center", *, title_size=11.0,
        item_size=8.2, dashed=False, lw=1.5, align="left", gap=1.15):
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
                color="#333333", linespacing=1.55, zorder=3)


def arrow(ax, p1, p2, label="", *, color="#4A4A4A", lw=1.6, style="-",
          ldx=0.0, ldy=0.0, lsize=8.0):
    ls = {"=": (0, (5, 2)), "-": "-"}[style]
    ax.add_patch(FancyArrowPatch(p1, p2, arrowstyle="-|>", mutation_scale=14,
                                 linewidth=lw, color=color, linestyle=ls, zorder=5,
                                 shrinkA=2, shrinkB=2))
    if label:
        ax.text((p1[0] + p2[0]) / 2 + ldx, (p1[1] + p2[1]) / 2 + ldy, label,
                ha="center", va="center", fontsize=lsize, color=color, zorder=6,
                bbox=dict(boxstyle="round,pad=0.24", fc="white", ec="none", alpha=0.95))


def elbow(ax, pts, *, color="#9E9E9E", lw=1.5, ls=(0, (5, 2))):
    for i in range(len(pts) - 2):
        ax.plot([pts[i][0], pts[i + 1][0]], [pts[i][1], pts[i + 1][1]],
                color=color, lw=lw, ls=ls, zorder=5, solid_capstyle="round")
    ax.add_patch(FancyArrowPatch(pts[-2], pts[-1], arrowstyle="-|>", mutation_scale=13,
                                 linewidth=lw, color=color, linestyle=ls, zorder=5))


fig, ax = plt.subplots(figsize=(17.6, 15.0), dpi=170)
ax.set_xlim(0, 100)
ax.set_ylim(0, 100)
ax.axis("off")

ax.text(50, 99.3, "用户管理模块设计：账号 · 注册 · 权限 · 个人中心",
        ha="center", va="top", fontsize=20, fontweight="bold", color="#1F4E79")
ax.text(50, 96.8,
        "一个账号中心（RuoYi sys_user）· 三种准入路径 · 三段式权限 · 个人中心只聚合不建表 · 与 OGE 账号域不做联邦",
        ha="center", va="top", fontsize=10.5, color="#555555")

# ── ① 准入：三条路径 ─────────────────────────────────────────────────────
ax.text(1.2, 95.0, "① 准入：三条路径", fontsize=11, fontweight="bold", color="#1F4E79")
box(ax, 1.5, 87.5, 27.0, 8.3, "A. 公众自助注册（门户 / 开放社区）",
    ["· 图形验证码 + 邮箱/手机验证码 + 频控",
     "· 落「公众用户」部门 → 角色 public_visitor",
     "· 注册 ≠ 授权：注册后只能看，要能做得走审批"],
    "entry", title_size=10.5)
box(ax, 29.8, 87.5, 27.0, 8.3, "B. 机构开户 / 批量导入（后台）",
    ["· 部门必选 + 岗位 + 初始角色 + 初始密码",
     "· 首登强制改密（pwd_update_date 置空）",
     "· Excel 批量导入，落对应单位部门树"],
    "entry", title_size=10.5)
box(ax, 58.1, 87.5, 27.9, 8.3, "C. 服务账号签发（开发管理）",
    ["· app_id / app_secret 哈希存储 + 白名单",
     "· 独立配额与有效期，不绑自然人",
     "· 不建 sys_user 账号（落 mogan_app 表）"],
    "entry", title_size=10.5)

# ── ② 账号中心 + 令牌服务 ────────────────────────────────────────────────
ax.text(1.2, 85.3, "② 账号中心（唯一身份权威）", fontsize=11, fontweight="bold", color="#B26A00")
box(ax, 1.5, 72.1, 62.0, 13.2, "RuoYi 账号中心 —— 一个账号中心，不做第二套用户表",
    ["sys_user（唯一账号表：公众 public / 机构 staff / 服务 service，user_type 区分）",
     "sys_dept 组织部门树（ancestors 祖链）· sys_post 岗位 · sys_role 角色（data_scope 1–5）",
     "sys_menu 菜单与按钮权限（perms）· sys_dict / sys_config 字典与参数 · sys_notice 通知",
     "关联：sys_user_role · sys_user_post · sys_role_menu · sys_role_dept",
     "部门树是权限骨架：攻坚小组按「小组」建部门，合作单位按单位建，公众挂独立根部门"],
    "account", title_size=12, lw=2.2)

box(ax, 65.0, 72.1, 21.0, 13.2, "令牌服务",
    ["RS256 JWT 唯一由平台签发（只覆盖三系统）：",
     "sub / userId / deptId / deptPath / tenant /",
     "accountType / roles / scopes / jti / exp",
     "· access 30min + refresh 7天",
     "· jti 黑名单：登出 / 踢人 / 停用 / 调岗",
     "  → 立即失效",
     "· /.well-known/jwks.json 公钥分发"],
    "token", title_size=11.5, lw=2.0)

arrow(ax, (32.0, 87.5), (32.0, 85.5), "开户 / 注册", color="#E8A33D", lw=1.8, style="=", ldx=9.5)
arrow(ax, (25.0, 72.1), (25.0, 69.9), "账号与角色 → 三段权限",
      color="#E8A33D", lw=1.8, style="=", ldx=19.0)

# ── ③ 权限三段 ───────────────────────────────────────────────────────────
ax.text(1.2, 69.9, "③ 权限管理：三段式（每段回答不同问题：能不能点 / 能看哪些 / 能用多少）",
        fontsize=11, fontweight="bold", color="#1F4E79")
box(ax, 1.5, 55.4, 27.0, 14.4, "① 功能权限 —— 能不能点",
    ["定义：sys_menu.perms（按钮级）",
     "执行：前端隐藏 + 后端注解",
     "落到：门户 / 莫干系统 / 后台",
     "      的全部接口",
     "",
     "例：system:user:add",
     "     card:publish",
     "     oge:execute"],
    "perm1")
box(ax, 29.8, 55.4, 27.0, 14.4, "② 数据与资源权限 —— 能看哪些",
    ["定义：sys_role.data_scope（1–5）",
     "      + sys_role_dept（自定义）",
     "执行：SDK Registry 过滤",
     "      + Security 网关",
     "落到：GeoCard 的 visibility /",
     "      tenant / owner",
     "",
     "可见 = 授权范围 ∩ visibility 上限"],
    "perm2", lw=2.2)
box(ax, 58.1, 55.4, 27.9, 14.4, "③ 配额与算力额度 —— 能用多少",
    ["定义：mogan_quota（部门总额 +",
     "      个人上限，两级取小）",
     "执行：SDK Scheduler 准入",
     "      + OGE 调用限额",
     "落到：ResourceRequirement /",
     "      并发上限 / 调用量 / OGE 计量",
     "",
     "准入阶段拒绝（带理由），不是跑到一半才炸"],
    "perm3")

# ── ④ 落地：个人中心 / 后台管理 / 资源服务器与 OGE ───────────────────────
ax.text(1.2, 53.2,
        "④ 落地：个人中心（聚合不建表）· 后台管理（RuoYi 原生 + 扩展）· 本平台三系统作为资源服务器 + OGE 独立账号域",
        fontsize=11, fontweight="bold", color="#1F4E79")
arrow(ax, (43.0, 55.4), (43.0, 53.0), "权限在三处执行", color="#2F8F4A", lw=1.8, ldx=14.0)

box(ax, 1.5, 30.0, 30.0, 23.2, "个人中心（计划 2.5）聚合视图 · 不建副本",
    ["我的资料 / 安全设置（改密·绑定·",
     "  两步验证·登出其他设备）",
     "我的组织与角色（只读）",
     "我的任务（SDK GeoTask + SSE）",
     "我的资产（Registry + OGE 授权）",
     "我的案例 · 我的知识（GeoKG 贡献）",
     "我的配额（含 OGE 计量）",
     "我的消息 · 我的审计 · 我的申请",
     "",
     "写操作只有：改资料 / 偏好 / 密码 /",
     "绑定 / 登出 / 撤销申请"],
    "center")

box(ax, 33.0, 30.0, 30.0, 23.2, "后台管理（计划 2.6）",
    ["RuoYi 原生直接用：",
     "  用户 · 部门 · 岗位 · 角色 · 菜单",
     "  字典 · 参数 · 通知 · 日志",
     "",
     "扩展菜单（本项目新增）：",
     "  资源管理（上下架）· 服务管理",
     "  （注册/启停/配额）· 开发管理",
     "  （应用/密钥/授权）· 审批管理",
     "  运营看板 · 配额管理",
     "",
     "边界：OGE「管理中心」只管资源与服务",
     "自身运维，不存用户表"],
    "admin")

box(ax, 64.5, 43.8, 21.5, 9.4, "本平台三系统 = 资源服务器",
    ["Platform：本地验签 + perms + 数据范围",
     "SDK / 执行面：服务 API Key（证明是平台）",
     "+ 用户 JWT 透传（证明代表谁）+ scopes",
     "GeoKG：读走白名单，写要 kg:write"],
    "server")

box(ax, 64.5, 30.0, 21.5, 13.2, "OGE（独立系统 · 自有账号域）",
    ["· 不接平台令牌：平台用应用凭证",
     "  mogan_oge_credential（加密）换 tk",
     "· OGE 只看到「平台这个应用」→ 用户级",
     "  权限与配额由平台自己兜",
     "· 用户无需在 OGE 注册",
     "· 不做账号联邦；确需独立开户由管理员代理开户 + 映射"],
    "ogenode", lw=2.2)

# 令牌下发走右侧走廊，绕开 ③ ④ 的盒子
elbow(ax, [(86.0, 78.7), (93.5, 78.7), (93.5, 48.3), (86.2, 48.3)], color="#8E5BA6", lw=1.6)
ax.text(93.5, 80.6, "令牌下发", ha="center", va="bottom", fontsize=7.8,
        color="#8E5BA6", fontweight="bold")
ax.text(93.5, 63.5, "JWT / 服务令牌\n（三系统就地验签）", ha="center", va="center",
        fontsize=7.8, color="#8E5BA6", linespacing=1.5)

# ── ⑤ 审计 ───────────────────────────────────────────────────────────────
arrow(ax, (20.0, 30.0), (20.0, 28.2), "", color="#9E9E9E", lw=1.4)
box(ax, 1.5, 19.4, 84.5, 8.3, "⑤ 审计（两处都落，且可关联）",
    ["sys_logininfor 登录日志：谁 / 何时 / 何 IP / 成功或失败原因      "
     "sys_oper_log 操作日志：谁 / 哪个接口 / 参数摘要 / 结果",
     "mogan_audit 任务与执行审计：谁（_identity）/ 执行了什么 / 用了哪个节点 / 产物在哪",
     "OGE 用量由平台记账（OGE 侧只看到「平台这个应用」）· 关联键 request_id：平台请求 ←→ GeoMCP 调用 ←→ 节点执行"],
    "audit", lw=1.6)

# ── 红线 ─────────────────────────────────────────────────────────────────
ax.text(1.5, 17.5, "五条红线（评审重点）", fontsize=11, fontweight="bold", color="#C00000")
box(ax, 1.5, 9.4, 84.5, 8.0, "",
    ["1. 注册 ≠ 授权：自助注册只拿到「能看」，要「能做」必须走审批（机构用户一律管理员开户）",
     "2. 数据权限不能只留在 Java：必须投影成 GeoCard 的 visibility / tenant / owner，由 SDK 在发现与执行两处强制执行",
     "3. 服务账号不得冒充用户：无 _identity 时只能做公共资产 + 平台级操作，审计标记 svc_*",
     "4. 越权返回 404 而非 403：不泄露「资产存在但无权」这一信息",
     "5. 与 OGE 不做账号联邦：平台用户无需在 OGE 注册，平台以应用凭证代表调用并记账"],
    "entry", item_size=8.3)

ax.text(1.5, 7.0, "注：账号类型只决定「怎么来的、能不能登录」，权限一律由角色决定 —— 不把权限判断散落到类型分支里。",
        fontsize=8.4, color="#666666", va="bottom")

x0 = 2.0
for style, color, label in [("=", "#E8A33D", "开户 / 注册 / 身份"), ("-", "#2F8F4A", "权限执行点"),
                            ("=", "#8E5BA6", "JWT 校验（本平台三系统）")]:
    ax.add_patch(FancyArrowPatch((x0, 3.6), (x0 + 3.0, 3.6), arrowstyle="-|>",
                                 mutation_scale=11, linewidth=1.6, color=color,
                                 linestyle={"=": (0, (5, 2))}.get(style, "-"), zorder=5))
    ax.text(x0 + 3.6, 3.6, label, fontsize=8.6, va="center", color="#333333")
    x0 += 21.0

fig.tight_layout(rect=(0.004, 0.004, 0.996, 0.996))
fig.savefig(OUT, dpi=170, facecolor="white")
print(f"✅ 已生成 {OUT.name}（{OUT.stat().st_size // 1024} KB）")
