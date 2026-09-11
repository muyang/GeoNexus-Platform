"""生成 2027 年度课题 1 研究方法与技术路线图（5 张 PNG）。

运行方式（需 matplotlib）：
    export MPLCONFIGDIR=/tmp/mplcfg
    /tmp/docxenv/bin/python gen_diagrams.py
"""

import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch
from matplotlib import font_manager

# ── 中文字体 ──
CJK = ["Hiragino Sans GB", "Songti SC", "Arial Unicode MS", "sans-serif"]
plt.rcParams["font.sans-serif"] = CJK
plt.rcParams["axes.unicode_minus"] = False

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "images")
os.makedirs(OUT, exist_ok=True)

# ── 配色 ──
C_BASE = "#B3D9F7"    # 浅蓝（底座）
C_CORE = "#FFE699"    # 浅黄（核心）
C_APP = "#C6E6C6"    # 浅绿（应用）
C_ARCH = "#F4B9B9"    # 浅红（成果/输出）
C_PHASE = "#D9D9D9"   # 浅灰（阶段）
C_TXT = "#1F2937"


def _box(ax, x, y, w, h, text, fc, fs=10, ec="#4A6B8A", lw=1.2, style="round,pad=0.02"):
    p = FancyBboxPatch(
        (x, y), w, h, boxstyle=style, linewidth=lw,
        edgecolor=ec, facecolor=fc, mutation_aspect=1,
    )
    ax.add_patch(p)
    ax.text(x + w / 2, y + h / 2, text, ha="center", va="center",
            fontsize=fs, color=C_TXT, wrap=True)


def _arrow(ax, x1, y1, x2, y2, color="#2E5E8C", lw=1.4, style="-|>", ms=11):
    a = FancyArrowPatch((x1, y1), (x2, y2), arrowstyle=style,
                        mutation_scale=ms, linewidth=lw, color=color)
    ax.add_patch(a)


def _save(fig, name):
    path = os.path.join(OUT, name)
    fig.savefig(path, dpi=170, bbox_inches="tight", facecolor="white")
    plt.close(fig)
    print(f"  ✓ {name}")


# ═══════════════════════════════════════════════════════════════
# 图 1：项目总体技术路线图
# ═══════════════════════════════════════════════════════════════
def fig_project_overall():
    fig, ax = plt.subplots(figsize=(11.5, 7.2))
    ax.set_xlim(0, 12); ax.set_ylim(0, 8.4); ax.axis("off")

    # 顶部：总体目标
    _box(ax, 0.6, 7.7, 10.8, 0.62, "总体目标：开放、安全、普惠的全球地理信息智能框架（GeoNexus）——支撑 UN-GGKIC 全球创新枢纽",
         C_BASE, fs=11, ec="#2E5E8C", lw=1.6)

    # 核心底座（课题1）
    _box(ax, 0.6, 6.3, 10.8, 1.1,
         "课题1 核心底座：全球地理信息智能框架研发与集成\n"
         "GeoMCP 协议栈  ·  GAKG 合约注册中心  ·  零信任安全合规  ·  CAFE 计算下推  ·  低代码智能开发",
         C_CORE, fs=10.5, ec="#8A6D1F")

    # 三大应用（课题2/3/4）
    apps = [
        ("课题2：地球观测卫星\n智能服务系统", C_APP),
        ("课题3：全球可持续发展\n评价服务系统", C_APP),
        ("课题4：地理信息知识与\n远程学习系统", C_APP),
    ]
    for i, (txt, fc) in enumerate(apps):
        x = 0.6 + i * 3.72
        _box(ax, x, 4.6, 3.4, 1.15, txt, fc, fs=10.5, ec="#3E6B3E")
        _arrow(ax, 2.5 + i * 3.72, 6.3 - 0.02, x + 1.7, 5.78, color="#4E7A4E")

    # 能力贯通
    _box(ax, 0.6, 3.35, 10.8, 0.85,
         "能力贯通：资源接入 → 语义对齐 → 智能调度 → 计算下推 → 决策交付（全链路自动化）",
         "#E8E3F5", fs = 10, ec="#5B4B8A")

    # 三阶段时间轴
    phases = [
        ("2026 基础构建期\nGeoMCP V1.0 · GAKG v0.5\nCAFE 原型 · 前端 V1.0\n卫星索引 ≥100 颗", C_PHASE),
        ("2027 深化完善期\n协议 V2.0 · 框架系统 V2.0\n伦理与安全规范 · 合规引擎\nModel Builder ≥50 节点", C_PHASE),
        ("2028 集成收尾期\nβ→业务化 · ≥400 颗卫星\nGeoKG ≥100 万实体\nUN-GGKIC 承载 · 15 国示范", C_PHASE),
    ]
    for i, (txt, fc) in enumerate(phases):
        x = 0.6 + i * 3.72
        _box(ax, x, 1.55, 3.4, 1.35, txt, fc, fs=9.5, ec="#7A7A7A")
        if i < 2:
            _arrow(ax, x + 3.4, 2.23, x + 3.72, 2.23, color="#6B7280")

    # 底部：考核指标呼应 + 成果出口
    _box(ax, 0.6, 0.35, 10.8, 0.75,
         "2027 项目考核：合规引擎并发判定延迟<50ms · 空间推理准确率+10% · Model Builder ≥50节点\n"
         "论文 3 篇 · 发明专利 3 项 · 软件著作权 2 项 · “GeoNow 2027”大会支撑 · 中期成果报告",
         C_ARCH, fs=9.5, ec="#9A3B3B")

    _save(fig, "fig1-overall.png")


# ═══════════════════════════════════════════════════════════════
# 图 2：课题1 总体技术路线图（递进逻辑）
# ═══════════════════════════════════════════════════════════════
def fig_subject1():
    fig, ax = plt.subplots(figsize=(11.5, 7.0))
    ax.set_xlim(0, 12); ax.set_ylim(0, 8.2); ax.axis("off")

    _box(ax, 0.6, 7.5, 10.8, 0.6,
         "课题1：全球地理信息智能框架研发与集成——拟解决“语义互认、安全信任、弹性调度、开发门槛”四大难题",
         C_BASE, fs=11, ec="#2E5E8C", lw=1.6)

    # 递进四阶段（2026 五子任务）
    stages = [
        ("标准引领\n[数据与模型交互标准化]\nGeoMCP V2 协议栈\nGAKG 合约元模型", C_CORE),
        ("安全筑基\n[默认安全·合规协作]\n零信任网关\n跨域合规引擎·水印", C_ARCH),
        ("引擎驱动\n[CAFE 下推·弹性调度]\nCentral+Worker 架构\nServerless 毫秒级伸缩", C_CORE),
        ("生态聚合\n[低代码·共享生态]\n可视化编排器\n预训练智能体矩阵", C_APP),
    ]
    for i, (txt, fc) in enumerate(stages):
        x = 0.6 + i * 2.86
        _box(ax, x, 5.4, 2.5, 1.55, txt, fc, fs=9.5, ec="#5B6B7A")
        if i < 3:
            _arrow(ax, x + 2.5, 6.18, x + 2.86, 6.18, color="#2E5E8C")

    # 2027 纵向深化 → 三大年度任务
    _box(ax, 0.6, 4.2, 10.8, 0.75,
         "2027 纵向深化：2026 五子任务 → 按“文档规范 / 系统集成 / 安全伦理”三条线重组为三大年度任务",
         "#E8E3F5", fs=10, ec="#5B4B8A")

    tasks = [
        ("2027 任务1\n《地理空间模型上下文协议 V2.0》技术文档\n承接：交互标准化 + GAKG",
         "协议 V2.0\n文档"),
        ("2027 任务2\n全球地理信息智能框架系统 V2.0\n承接：合约注册中心+CAFE+低代码",
         "框架系统\nV2.0"),
        ("2027 任务3\n《地理空间人工智能应用伦理准则与安全规范》\n承接：默认安全与合规协作",
         "伦理与安全\n规范"),
    ]
    for i, (txt, badge) in enumerate(tasks):
        x = 0.6 + i * 3.72
        _box(ax, x, 2.55, 3.4, 1.35, txt, "#FFFFFF", fs=9, ec="#2E5E8C")
        _box(ax, x + 0.9, 1.75, 1.6, 0.55, badge, C_ARCH, fs=9.5, ec="#9A3B3B")

    # 底部：输出
    _box(ax, 0.6, 0.4, 10.8, 0.95,
         "成果出口：2 份技术文档（协议 V2.0 / 伦理与安全规范）+ 可运行框架系统 V2.0\n"
         "支撑三大应用系统升级（课题 2/3/4 的 V2.0），形成“研发—应用—反馈—优化”闭环",
         C_APP, fs=9.5, ec="#3E6B3E")

    _save(fig, "fig2-subject1.png")


# ═══════════════════════════════════════════════════════════════
# 图 3：任务1 协议 V2.0 技术路线
# ═══════════════════════════════════════════════════════════════
def fig_task_protocol():
    fig, ax = plt.subplots(figsize=(11.5, 5.4))
    ax.set_xlim(0, 12); ax.set_ylim(0, 6.2); ax.axis("off")

    _box(ax, 0.6, 5.45, 10.8, 0.55,
         "任务1：《地理空间模型上下文协议 V2.0》技术文档编制——协议工程方法",
         C_BASE, fs=10.5, ec="#2E5E8C", lw=1.5)

    steps = [
        ("前期基础\nGeoMCP V1.0\nJSON-RPC 2.0\nJava/Python 双端实现", C_PHASE),
        ("需求调研\n异构系统互操作\n四层原语定义\n国际标准对标", C_CORE),
        ("协议设计\n握手/控制/数据/事件\ncontract_binding\npushdown_spec\nfederated_sources", C_CORE),
        ("SDK 实现\n跨平台通信套件\nJava/Python SDK\n契约测试对齐", C_APP),
        ("一致性验证\nconformance vectors\n双端 CI 独立验证\n≥13 测试用例", C_APP),
        ("文档定稿\n协议 V2.0 技术文档\n国际标准草案\n发布评审", C_ARCH),
    ]
    for i, (txt, fc) in enumerate(steps):
        x = 0.5 + i * 1.92
        _box(ax, x, 3.6, 1.62, 1.5, txt, fc, fs=8, ec="#5B6B7A")
        if i < 5:
            _arrow(ax, x + 1.62, 4.35, x + 1.92, 4.35)

    _box(ax, 0.6, 2.1, 10.8, 0.7,
         "关键方法：协议栈分层抽象（四层原语）· 增量演进（V1.0 兼容 V2.0）· 契约驱动开发（先定义向量再实现）\n"
         "原理依托：ISO/TC 211 元模型 与 轻量级 OGC API 融合 · JSON-RPC over WebSocket + SSE 事件推送",
         "#E8E3F5", fs = 9, ec="#5B4B8A")

    _box(ax, 0.6, 0.4, 10.8, 1.1,
         "2027 产出：《地理空间模型上下文协议 V2.0》技术文档 1 份（评审通过）\n"
         "配套成果：双端 SDK 一致性测试通过 · 支撑框架系统 V2.0 与课题 2/3/4 协议对接",
         C_APP, fs=9.5, ec="#3E6B3E")

    _save(fig, "fig3-task-protocol.png")


# ═══════════════════════════════════════════════════════════════
# 图 4：任务2 框架系统 V2.0 技术路线
# ═══════════════════════════════════════════════════════════════
def fig_task_framework():
    fig, ax = plt.subplots(figsize=(11.5, 5.6))
    ax.set_xlim(0, 12); ax.set_ylim(0, 6.4); ax.axis("off")

    _box(ax, 0.6, 5.65, 10.8, 0.55,
         "任务2：全球地理信息智能框架系统 V2.0 研发——系统工程方法",
         C_BASE, fs=10.5, ec="#2E5E8C", lw=1.5)

    # 三大引擎（承接2026子任务2/3/5）
    engines = [
        ("GAKG 合约注册中心 V2.0\n自动扫描流水线规模化\nPostGIS+pgvector+Neo4j\n合约满足度门控增强", C_CORE),
        ("CAFE 计算下推引擎 V2.0\nCentral+Worker 集群扩展\n多目标智能路由\nServerless 弹性调度", C_CORE),
        ("低代码开发环境 V2.0\nModel Builder 升级\n≥50 节点拖拽连线\n智能体挂载", C_APP),
    ]
    for i, txt in enumerate(engines):
        x = 0.6 + i * 3.72
        _box(ax, x, 4.25, 3.4, 1.15, txt, "#FFFFFF", fs=8.5, ec="#2E5E8C")

    _box(ax, 0.6, 3.15, 10.8, 0.7,
         "集成主线：注册中心（资产可发现）→ 安全网关（资产可信）→ 下推引擎（资产可算）→ 低代码（资产可用）",
         "#E8E3F5", fs=9.5, ec="#5B4B8A")

    _box(ax, 0.6, 1.95, 10.8, 0.85,
         "关键方法：组件化解耦（五大能力独立演进）· 多目标路由（数据本地性+算力余量+合规策略）\n"
         "原理依托：CAFE“计算移动至数据端”范式 · AI 流量预测预热（毫秒级冷启动）· 可视化状态机",
         "#F2F2F2", fs=9, ec="#7A7A7A")

    _box(ax, 0.6, 0.4, 10.8, 1.1,
         "2027 产出：可运行框架系统 V2.0（含 Model Builder ≥50 节点流畅拖拽与智能体挂载）\n"
         "配套成果：≥5 个 GeoWorkflow 生产级运行 · 联邦数据适配器 ≥5 类 · 支撑三大应用 V2.0 集成",
         C_APP, fs=9.5, ec="#3E6B3E")

    _save(fig, "fig4-task-framework.png")


# ═══════════════════════════════════════════════════════════════
# 图 5：任务3 伦理准则与安全规范
# ═══════════════════════════════════════════════════════════════
def fig_task_safety():
    fig, ax = plt.subplots(figsize=(11.5, 5.6))
    ax.set_xlim(0, 12); ax.set_ylim(0, 6.4); ax.axis("off")

    _box(ax, 0.6, 5.65, 10.8, 0.55,
         "任务3：《地理空间人工智能应用伦理准则与安全规范》编制——安全工程与伦理治理方法",
         C_BASE, fs=10.5, ec="#2E5E8C", lw=1.5)

    steps = [
        ("法规知识抽取\n≥10 国测绘法规\n跨域合规本体库\nOPA 策略规则化", C_CORE),
        ("合规核验引擎\n协议层拦截器\n几何拓扑+敏感语义\n并发判定<50ms", C_CORE),
        ("隐私增强计算\n联邦学习\n安全多方计算\n差分隐私", C_APP),
        ("伦理治理框架\n数据主权·算法公平\n可解释·问责制\nGeoAI 应用边界", C_ARCH),
        ("规范编制\n伦理准则安全规范\n技术文档评审\n发布", C_ARCH),
    ]
    for i, (txt, fc) in enumerate(steps):
        x = 0.5 + i * 2.32
        _box(ax, x, 3.7, 2.0, 1.5, txt, fc, fs=8.5, ec="#5B6B7A")
        if i < 4:
            _arrow(ax, x + 2.0, 4.45, x + 2.32, 4.45)

    _box(ax, 0.6, 2.15, 10.8, 0.75,
         "原理依托：零信任架构（默认拒绝、持续验证）· 隐私增强计算（数据可用不可见）· 空间数据水印（泄露追溯）\n"
         "国际对齐：UN 伦理框架 · 各国测绘法规 · 中国《新一代人工智能伦理规范》",
         "#E8E3F5", fs = 9, ec="#5B4B8A")

    _box(ax, 0.6, 0.4, 10.8, 1.1,
         "2027 产出：《地理空间人工智能应用伦理准则与安全规范》文档 1 份（评审通过）\n"
         "配套成果：合规引擎并发判定延迟 <50ms 达标 · 零信任安全网关全面就绪 · 支撑课题 2/3/4 合规接入",
         C_APP, fs=9.5, ec="#3E6B3E")

    _save(fig, "fig5-task-safety.png")


if __name__ == "__main__":
    print("生成 2027 课题1 技术路线图：")
    fig_project_overall()
    fig_subject1()
    fig_task_protocol()
    fig_task_framework()
    fig_task_safety()
    print("完成 →", OUT)