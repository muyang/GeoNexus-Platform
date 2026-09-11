#!/usr/bin/env python3
"""
Generate the GeoNexus Implementation Plan DOCX document.
Formatting matches the reference: 20260519-下午5点-项目实施方案.docx
"""

from docx import Document
from docx.shared import Pt, Inches, Cm, Emu, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_LINE_SPACING
from docx.oxml.ns import qn, nsdecls
from docx.oxml import parse_xml

# ---------------------------------------------------------------------------
# Constants matching the reference document
# ---------------------------------------------------------------------------
PAGE_WIDTH  = Emu(7560945)
PAGE_HEIGHT = Emu(10693400)
MARGIN      = Emu(914400)

FONT_BODY      = '仿宋_GB2312'
FONT_H1        = '黑体'
FONT_H2        = '楷体_GB2312'
FONT_H3        = '黑体'
FONT_COVER     = '方正小标宋简体'
FONT_COVER_EN  = 'Times New Roman'

SIZE_COVER_TITLE = Pt(26)
SIZE_COVER_ORG   = Pt(22)
SIZE_COVER_DATE  = Pt(18)
SIZE_H1          = Pt(14)
SIZE_H2          = Pt(14)
SIZE_H3          = Pt(14)
SIZE_BODY        = Pt(12)
SIZE_TABLE       = Pt(10)
SIZE_REF         = Pt(9)

INDENT_2CHAR = Emu(304800)
LINE_SPACING = 1.5

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def set_run_font(run, font_name, size, bold=False, color=None):
    run.font.name = font_name
    run.font.size = size
    run.bold = bold
    if color:
        run.font.color.rgb = color
    rPr = run._element.get_or_add_rPr()
    rFonts = rPr.find(qn('w:rFonts'))
    if rFonts is None:
        rFonts = parse_xml(f'<w:rFonts {nsdecls("w")} />')
        rPr.insert(0, rFonts)
    rFonts.set(qn('w:eastAsia'), font_name)
    rFonts.set(qn('w:ascii'), font_name)
    rFonts.set(qn('w:hAnsi'), font_name)


def set_para_fmt(para, line_spacing=LINE_SPACING, first_line_indent=None,
                 space_before=0, space_after=0, alignment=None):
    pf = para.paragraph_format
    pf.line_spacing = line_spacing
    if first_line_indent is not None:
        pf.first_line_indent = first_line_indent
    pf.space_before = Pt(space_before)
    pf.space_after = Pt(space_after)
    if alignment is not None:
        para.alignment = alignment


def add_heading(doc, text, level=1):
    para = doc.add_paragraph()
    run = para.add_run(text)
    if level == 1:
        set_run_font(run, FONT_H1, SIZE_H1, bold=True)
        set_para_fmt(para, space_before=6, space_after=3)
    elif level == 2:
        set_run_font(run, FONT_H2, SIZE_H2, bold=True)
        set_para_fmt(para, space_before=3, space_after=2)
    elif level == 3:
        set_run_font(run, FONT_H3, SIZE_H3, bold=True)
        set_para_fmt(para, first_line_indent=INDENT_2CHAR, space_before=2, space_after=1)
    return para


def add_body(doc, text, indent=True, bold=False):
    para = doc.add_paragraph()
    run = para.add_run(text)
    set_run_font(run, FONT_BODY, SIZE_BODY, bold=bold)
    set_para_fmt(para, first_line_indent=INDENT_2CHAR if indent else None,
                 alignment=WD_ALIGN_PARAGRAPH.JUSTIFY)
    return para


def add_cover_line(doc, text, font_name, size, alignment=WD_ALIGN_PARAGRAPH.CENTER):
    para = doc.add_paragraph()
    run = para.add_run(text)
    set_run_font(run, font_name, size)
    para.alignment = alignment
    set_para_fmt(para, first_line_indent=None)
    return para


def add_blank(doc, count=1):
    for _ in range(count):
        para = doc.add_paragraph()
        set_para_fmt(para, first_line_indent=None)


def add_table(doc, headers, rows):
    table = doc.add_table(rows=1 + len(rows), cols=len(headers))
    table.style = 'Table Grid'
    for j, header in enumerate(headers):
        cell = table.rows[0].cells[j]
        cell.text = ''
        p = cell.paragraphs[0]
        r = p.add_run(header)
        set_run_font(r, FONT_H3, SIZE_TABLE, bold=True)
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        shading = parse_xml(f'<w:shd {nsdecls("w")} w:fill="D9D9D9" w:val="clear"/>')
        cell._element.get_or_add_tcPr().append(shading)
    for i, row in enumerate(rows):
        for j, cell_text in enumerate(row):
            cell = table.rows[i + 1].cells[j]
            cell.text = ''
            p = cell.paragraphs[0]
            r = p.add_run(str(cell_text))
            set_run_font(r, FONT_BODY, SIZE_TABLE)
            p.alignment = WD_ALIGN_PARAGRAPH.LEFT
    doc.add_paragraph()
    return table


# ===========================================================================
# MAIN
# ===========================================================================

doc = Document()

section = doc.sections[0]
section.page_width  = PAGE_WIDTH
section.page_height = PAGE_HEIGHT
section.top_margin    = MARGIN
section.bottom_margin = MARGIN
section.left_margin   = MARGIN
section.right_margin  = MARGIN

style = doc.styles['Normal']
style.font.name = FONT_BODY
style.font.size = SIZE_BODY
style.paragraph_format.line_spacing = LINE_SPACING
style.paragraph_format.first_line_indent = INDENT_2CHAR
style.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY

# ===================================================================
# COVER
# ===================================================================
add_blank(doc, 3)
add_cover_line(doc, '全球地理信息智能框架及服务系统研发', FONT_COVER, SIZE_COVER_TITLE)
add_blank(doc, 1)
add_cover_line(doc, '实施方案', FONT_COVER, SIZE_COVER_TITLE)
add_blank(doc, 6)
add_cover_line(doc, '莫干山地信实验室', FONT_COVER_EN, SIZE_COVER_ORG)
add_cover_line(doc, '二〇二六年五月', FONT_COVER, SIZE_COVER_DATE)
doc.add_page_break()

# ===================================================================
# 项目概要
# ===================================================================
add_heading(doc, '项目概要', 1)

add_body(doc,
    '本项目"全球地理信息智能框架及服务系统研发"（GeoNexus）与"全球地理信息公共产品研制"'
    '同属于专项"全球地理信息公共产品关键技术研发与应用"，共同围绕"研制全球地理信息公共产品，'
    '推进建成开放、普惠、安全的全球地理信息知识与创新服务枢纽，支撑联合国全球地理信息知识与'
    '创新中心（UN-GGKIC），服务全球新型治理体系建设"的总体目标。')

add_body(doc,
    '本项目侧重于构建开放、安全、普惠的全球地理信息智能框架，并基于该框架研发地球观测卫星智能'
    '服务系统、全球可持续发展评价系统、地理信息知识库与远程学习系统，打通从"底层算力数据"到'
    '"顶层应用赋能"的全链路。项目采用"一基座、三应用"的（1+3）总体架构，系统性地分解为四个'
    '高度关联、相互支撑的课题：')

add_body(doc, '课题1：全球地理信息智能框架研发与集成（663.52万元）')
add_body(doc, '课题2：地球观测卫星智能服务系统研发（642.97万元）')
add_body(doc, '课题3：全球可持续发展评价服务系统研发（657.43万元）')
add_body(doc, '课题4：地理信息知识库与远程学习系统研发（766.08万元）')

add_body(doc,
    '项目总经费2730万元，执行周期2026年1月至2028年12月（共36个月）。')

add_body(doc,
    '本项目深度融合三种设计哲学形成统一技术架构：（1）CAFE分布式计算范式（清华，Xu & Bai '
    'et al., 2018）——"计算移动至数据端"、Worker就近执行、零原始数据下载；（2）AutoGIS'
    '双智能体架构（清华，Chen, Bai & Li et al., 2025）——合约驱动的Data Agent + Code '
    'Agent、GAKG知识图谱、自修复循环；（3）GeoMCP V2协议——在已有Phase 1 GeoMCP基础上'
    '增强contract_binding、pushdown_spec、federated_sources字段，成为跨三层统一通信总线。')

# ===================================================================
# 一、项目背景与意义
# ===================================================================
add_heading(doc, '一、项目背景与意义', 1)

add_heading(doc, '1.1 项目背景', 2)

add_body(doc,
    '当前，全球数字化转型与可持续发展进程的深度融合，正推动地理信息服务从"数据供应"向'
    '"智能决策"范式跃迁。然而，广大发展中国家在利用地理信息技术监测联合国《2030年可持续'
    '发展议程》、应对气候变化与灾害应急等共同挑战时，正面临着从"数字鸿沟"向"智能鸿沟"加速'
    '演化的现实困境。')

add_body(doc,
    '一方面，全球地理空间资源高度分散于不同主权主体与异构系统之中，缺乏统一的交互语言与'
    '互操作机制，导致多源数据融合成本居高不下；另一方面，以大语言模型为代表的新一代人工智能'
    '技术在地理空间垂直应用中存在显著的"语义鸿沟"，通用大模型难以精准理解并调用坐标系变换、'
    '缓冲区分析等专业空间计算工具。上述技术瓶颈与发展中国家基础设施薄弱、专业人才匮乏的现状'
    '形成叠加效应，使得获取地理信息难、使用技术工具门槛高、获得专业知识服务匮乏，成为制约'
    '全球南方国家可持续发展的普遍难题。')

add_body(doc,
    '为深入落实联合国2030年可持续发展议程，中国政府支持联合国在华设立了全球地理信息知识'
    '与创新中心（UN-GGKIC），旨在为发展中国家提供知识共享、技术创新与能力建设。如何打破'
    '资源分散格局、弥合语义理解鸿沟、降低专业技术门槛，已成为UN-GGKIC履行其全球职责亟待'
    '突破的核心命题。')

add_body(doc,
    '在此背景下，仅依靠传统的数据共享或单点技术突破，已难以满足全球治理体系对系统性、'
    '智能化地理信息服务的迫切需求。UN-GGKIC亟需一个开放、安全、普惠的全球地理信息知识与'
    '创新枢纽。与之并行推进的"全球地理信息公共产品研制"项目聚焦于构建完整开放的"数据-知识'
    '-服务"产品矩阵，解决"有什么"的基础供给问题；相呼应，本项目则致力于解决"怎么用"和'
    '"用得好"的核心瓶颈，旨在为全球海量地理资源与知识产品提供一个枢纽化的服务系统与开放'
    '协同的技术生态。')

add_heading(doc, '1.2 项目的紧迫性与必要性', 2)

add_body(doc,
    '其一，在生态构建层面，亟需统一交互协议以破解异构系统互操作难题。全球地理信息服务'
    '碎片化的根源在于缺乏跨域协同的通用语言。各类空间数据服务平台、计算引擎与人工智能模型'
    '之间彼此孤立，智能体无法自主感知并调用分布式节点上的专业算子，导致多源资源的有效集成'
    '与协同调度难以实现。研发突破多源异构资源协同调度、跨域主权数据可信流通等技术难题，从'
    '通信协议栈底层定义异构系统间的交互规范与信任契约，已成为构建全球地理信息开放共生生态的'
    '基础性前提。')

add_body(doc,
    '其二，在能力普惠层面，亟需低门槛的技术开发框架以消除发展中国家的智能鸿沟。面对复杂'
    '的空间分析与模型调用流程，广大发展中国家的决策者与技术人员往往因技术门槛而望而却步。'
    '现有工具多面向专业用户设计，缺乏对业务逻辑的抽象封装与可视化编排能力，难以在地理信息'
    '能力薄弱地区落地应用。因此，研发算力资源弹性调度与低代码智能开发等技术，将复杂算法'
    '转化为"开箱即用"的公共产品服务，能够有效地实现技术普惠、提升全球南方国家自主落实SDGs能力。')

add_body(doc,
    '其三，在体系集成层面，亟需全链条技术贯通以形成规模化服务能力。目前，我国在地理信息'
    '领域的技术输出仍多为"单点突破"，离散化的供给模式导致产品影响力有限，尚未形成覆盖资源'
    '接入、智能调度、应用集成等全面的完整技术体系。通过构建全球地理信息智能框架，突破遥感'
    '影像智能推荐、时空知识图谱构建与更新等关键技术，研究跨模态地理大模型高效微调与多智能体'
    '开发技术，打通从底层模型到顶层决策的全链条技术通路，是将中国经验转化为具体行动方案、将'
    '技术储备转化为国际公共产品供给能力的根本保障。')

# ===================================================================
# 二、国内外研究现状及技术发展趋势
# ===================================================================
add_heading(doc, '二、国内外研究现状及技术发展趋势', 1)

add_heading(doc, '2.1 研究现状', 2)

add_body(doc,
    '为深入落实联合国2030年可持续发展议程，全球地理信息服务正从传统的"数据供应"向'
    '"智能决策"范式发生根本性跃迁。在这一进程中，大语言模型（LLMs）、多模态遥感基础模型'
    '（RSFMs）以及云原生架构的引入为地理空间科学带来了前所未有的机遇。当前研究现状主要体现'
    '在以下五个核心维度：')

add_body(doc,
    '（1）广域跨域交互协议与主权数据可信流通。建设全球地理信息知识与创新枢纽的首要障碍'
    '在于全球地理空间资源的高度分散。在互操作协议层面，模型上下文协议（Model Context Protocol, '
    'MCP）作为一种定义AI应用与外部数据源及工具间双向连接的开放标准，正迅速向地理信息领域'
    '演化出专属的规范（Anthropic, 2025）。GeoMCP通过在底层通信栈上利用JSON-RPC 2.0格式，'
    '使大语言模型等智能体可以跨越物理边界，自主发现并安全调用分布式节点上的专业GIS算子。在'
    '跨域主权数据可信流通层面，学术前沿正转向基于"可用不可见"原则的联邦学习与可信数据空间'
    '架构，结合密码学防泄露访问控制与底层协议级互认机制，支撑全球公共地理产品的安全共享。')

add_body(doc,
    '（2）地理空间大模型与语义鸿沟破解。通用大语言模型在地理空间垂直应用中暴露出显著的'
    '"语义鸿沟"。当前研究沿三个方向深度展开：一是模型微调与垂直训练，如K2地球科学基础大模型'
    '基于LLaMA架构在地学文献与GeoSignal指令集上进行微调（Deng et al., 2024）；二是智能体'
    '工具使用与检索增强（Geo-RAG），如MapGPT等Agentic GIS框架允许大模型作为"中枢大脑"通过'
    '意图解析自主规划任务并调用外部专业GIS API（Lin et al., 2026）；三是知识图谱增强大模型'
    '（KG-Enhanced LLM），如S-GMKG语义驱动的地理建模知识图谱从海量GIS脚本中提取功能单元，'
    '为大模型生成复杂空间分析代码提供可解释的图结构路径指导（Hou et al., 2024）。')

add_body(doc,
    '（3）多模态遥感基础模型与影像智能推荐。多模态遥感基础模型（MM-RSFMs）成为实现'
    '遥感影像智能推荐与自动化解译的关键。SkySense在超过2150万个时序多模态遥感数据集上进行'
    '预训练，创新性地提出了多粒度对比学习与地理上下文原型学习机制（Guo et al., 2024）。针对'
    '基础大模型在垂直应用中算力消耗过大的问题，参数高效微调（PEFT）技术（如LoRA）被广泛应用'
    '于跨模态地理大模型中。')

add_body(doc,
    '（4）基于大模型与人机协同的知识图谱构建。地理知识图谱（KG）正全面跨越以固定事实'
    '为主的静态阶段，迈向时序知识图谱（TKGs）与事件知识图谱（EKGs），以显式表达地球系统的'
    '物理因果链与状态转移规律（Xui et al., 2024）。当前前沿研究致力于构建基于知识图谱与大模型'
    '双核驱动、众包协同与专家审核（HITL）结合的持续自主学习知识库系统（Bian, 2025），呈现出'
    '"异构数据融合→图谱生成→众包协同验证→持续学习更新"的高度自动化闭环特征。')

add_body(doc,
    '（5）云原生算力底座与低代码普惠智能服务。云原生地理信息架构与Serverless计算的深度'
    '融合正在成为主流（Amiri et al., 2022）。应用利用分布式计算直接对云端海量空间数据（如'
    'Cloud-Optimized GeoTIFF）进行就地计算。"计算下推（Pushdown）"正在成为处理海量遥感影像'
    '的核心范式——通过将算法直接推送到距离原始卫星数据最近的边缘节点内核中执行，从根本上解决'
    'PB级数据跨洲际传输的网络瓶颈。')

add_heading(doc, '2.2 发展趋势', 2)

add_body(doc,
    '面向2025年及未来，全球地理信息智能服务正处于从工具化向生态化、从被动数据分发向主动'
    '智能决策演进的关键转折点。核心趋势归结为以下四个维度：')

add_body(doc,
    '（1）地理模型上下文协议与数据主权流通的标准化普及。未来的全球地理空间网络将不再是'
    '由一个个封闭数据门户组成的孤岛，而是由通用协议串联的全球协同生态。GeoMCP将成为构建'
    '地理信息服务枢纽的底层信任契约，通过标准化的大模型通信接口，全球分散的地理资源、算力'
    '节点与专业算法将实现"即插即用"式的互联互通。')

add_body(doc,
    '（2）从单点提取走向多智能体协同架构。传统的GIS软件操作将全面让位于"Agentic GIS"'
    '（代理化GIS）。AI将从单纯的辅助分析工具，蜕变为具备"感知-规划-执行-反思"闭环能力的'
    '自主智能体集群（Hinchcliffe & Patience, 2025）。基于图结构（如LangGraph）的多智能体'
    '协作将主导地理分析管线。')

add_body(doc,
    '（3）时空知识图谱与跨模态大模型的双向赋能。面向高风险的全球灾害响应与SDGs政策推演，'
    '地理空间智能将全面转向大模型（LLM）与知识图谱（KG）的"双向赋能"（Xui et al., 2024）。'
    '一方面"图谱约束大模型"成为标配，另一方面"大模型反哺图谱"实现知识库的自我繁衍。')

add_body(doc,
    '（4）云原生下推与一站式服务聚合。"计算下推（Pushdown）"将成为核心范式，通过将大模型'
    '生成的算法直接推送到距离原始卫星数据最近的边缘节点内核中执行。在应用端，平台将演进为'
    '"一站式"的能力汇聚中枢，通过云端流式渲染与多语言实时转换，为全球发展中国家提供无缝衔接'
    '的远程学习与本土化诊断工具。')

# ===================================================================
# 三、项目目标
# ===================================================================
add_heading(doc, '三、项目目标', 1)

add_heading(doc, '3.1 总体目标', 2)

add_body(doc,
    '本项目拟针对全球地理空间资源分散、异构系统互操作难及发展中国家技术能力弱等问题，'
    '解决多源异构资源协同优化的科学问题，突破广域跨域协议互认、算力资源弹性调度与低代码'
    '智能开发等关键技术。预期构建一个开放、普惠、安全的全球地理空间智能框架（GeoNexus），'
    '并研制地球观测卫星智能服务、全球可持续发展评价、地理信息知识库与远程学习三大应用系统。'
    '成果将应用于联合国SDGs监测、全球生态环境评估及教育培训等领域，为全球创新服务提供统一'
    '技术底座。通过形成"数据智能-决策支持"全链条能力，有效消除数字鸿沟，显著提升全球特别是'
    '发展中国家落实2030议程的能力。')

add_heading(doc, '3.2 具体目标', 2)

goals = [
    ('目标一：构建全球地理信息智能框架底座（GeoNexus）。',
     '研发GeoMCP V2地理模型上下文协议栈与地理资产元模型体系（GAKG Contract Registry），'
     '突破多源异构资源的语义对齐与标准化互操作难题；构建零信任安全网关与跨域合规协作引擎，'
     '实现"数据可用不可见"的主权数据可信流通；研发Serverless弹性算力调度与计算下推（Pushdown）'
     '引擎，形成CAFE Worker模式的就近计算能力；开发意图驱动的低代码智能体编排环境，将复杂'
     '空间算法转化为可视化拖拽式工作流。'),
    ('目标二：研发地球观测卫星智能服务系统。',
     '建立覆盖不少于400颗主流对地观测卫星的互联协议与动态知识库，研发多模态智能匹配引擎'
     '实现自然语言到卫星数据参数的任务解析；构建云原生遥感影像智能预处理与轻量化切片工具箱；'
     '开发面向灾害应急、农业监测、森林保护等场景的智能体应用卡片，实现从需求触达到决策简报'
     '生成的全流程自动化。'),
    ('目标三：研发全球可持续发展评价服务系统。',
     '研发多源异构数据（社会经济与空间观测）的融合同化与质量评估工具；构建基于灵活指标体系'
     '的可视化互操作对标平台；集成系统动力学模型与多目标优化算法，打造"数据融合-指标计算-'
     '情景模拟-诊断报告"的完整决策闭环。支持不少于10项SDG指标的在线监测、差距分析与国别诊断。'),
    ('目标四：研发地理信息知识库与远程学习系统。',
     '研发基于众包机制的空间知识图谱动态构建与更新技术，构建涵盖"概念-方法-工具-案例-场景"'
     '的多维知识图谱；开发智能检索与个性化学习推荐引擎；搭建支持远程实操的虚拟实训沙盒环境；'
     '构建集知识整合、在线学习与社群交流于一体的长效运营服务体系。完成不少于15个国家的示范应用。'),
]
for title, desc in goals:
    add_body(doc, title + desc)

# ===================================================================
# 四、研究内容
# ===================================================================
add_heading(doc, '四、研究内容', 1)

add_heading(doc, '4.1 顶层设计与核心底座：全球地理信息智能框架研发与集成（课题1）', 2)
add_body(doc,
    '本课题旨在构建GeoNexus全球地理信息智能框架的顶层架构与核心底座。通过研发GeoMCP '
    'V2地理模型上下文协议与GAKG地理资产合约注册中心，从通信协议栈底层定义异构系统间的交互'
    '规范，解决多源数据、模型与专业工具的互操作难题；深度整合数据主权保护与跨域联邦计算技术，'
    '构建零信任协同的安全契约；突破算力弹性调度与计算下推引擎，利用可视化低代码编排手段将'
    '复杂空间算法转化为"开箱即用"的服务。')

add_body(doc, '核心设计理念融合：', bold=True)
add_body(doc,
    'CAFE的"零数据下载"：每个GeoNode实现"Central Server + N×Worker节点"的CAFE Worker '
    '模式，计算下推Protocol将代码推送到数据所在Worker执行。')
add_body(doc,
    'AutoGIS的"合约驱动"：GAKG本土化为GeoAsset Contract Registry，每个数据产品同步生成'
    'Data Contract（CRS/bbox/geometry/bands），GeoSkill执行前必须通过Contract Satisfaction Gating。')
add_body(doc,
    'GeoMCP V2协议增强：增加contract_binding、pushdown_spec、federated_sources字段，'
    '成为跨三层统一通信总线。')

add_heading(doc, '4.2 应用系统一：地球观测卫星智能服务系统研发（课题2）', 2)
add_body(doc,
    '依托底座框架，聚焦全球空间感知能力的普惠化。突破遥感资源跨模态语义推荐与高效调度技术，'
    '建立全球主流卫星资源的互联协议与动态知识库；研发部署于云端的遥感影像智能预处理与轻量化'
    '切片工具箱；针对灾害应急、气候变化等典型场景，开发场景化应用智能体，实现从自然语言需求到'
    '数据获取、智能处理与专题信息生成的全自动化。')

add_heading(doc, '4.3 应用系统二：全球可持续发展评价服务系统研发（课题3）', 2)
add_body(doc,
    '聚焦SDG评价服务与决策支持能力的构建。面向发展中国家本地化评估需求，研发多源异构数据'
    '（社会经济与空间观测）的融合同化与质量评估工具；构建基于最佳实践与灵活指标体系的可视化'
    '互操作对标平台；集成系统动力学模型与多目标优化算法，打造"数据融合-指标计算-情景模拟-'
    '诊断报告"的完整决策闭环。')

add_heading(doc, '4.4 应用系统三：地理信息知识与远程学习系统研发（课题4）', 2)
add_body(doc,
    '聚焦全球地理信息能力建设与知识共享。研发基于众包机制的空间知识图谱动态构建与更新技术；'
    '开发智能检索与个性化学习推荐引擎；搭建支持远程实操的虚拟实训沙盒；构建集知识整合、在线'
    '学习与社群交流于一体的服务生态，助力发展中国家跨越"智能鸿沟"。')

add_heading(doc, '4.5 应用示范与验证', 2)
add_body(doc,
    '以非洲典型国家为主要对象，依托专项成果进行集成示范应用。综合利用GeoNexus智能框架'
    '形成的各类产品与服务系统，以IGIF实施和地理信息管理能力提升为需求牵引，按照自主维护应用、'
    '协同维护应用、援助维护应用三个层级构建"一国一策"应用示范。完成不少于15个国家的示范应用部署。')

# ===================================================================
# 五、项目考核指标
# ===================================================================
add_heading(doc, '五、项目考核指标', 1)

add_heading(doc, '5.1 项目考核技术指标', 2)

add_table(doc,
    ['指标类别', '考核指标', '完成时状态'],
    [
        ['协议标准', 'GeoMCP V2协议栈规范', '正式发布，包含discovery/execution/pushdown/federation四层原语'],
        ['协议标准', 'GeoAsset Contract数据模型', '覆盖≥6种数据类型（raster/vector/3D/temporal/statistical/text）'],
        ['平台系统', 'GeoNexus智能框架平台', '上线运行，支持≥100个GeoNode节点注册与发现'],
        ['平台系统', '三大应用系统', '全部上线运行'],
        ['卫星资源', '卫星数据集成与访问能力', '≥400颗卫星元数据统一索引'],
        ['SDG指标', 'SDG在线监测与分析', '≥10项指标，含差距分析与诊断报告自动生成'],
        ['知识图谱', 'GeoKG知识图谱', '≥100万实体，覆盖SDGs/IGIF/国土空间规划三大领域'],
        ['示范应用', '国家示范应用', '≥15个国家'],
        ['联邦适配', '联邦数据适配器', '≥5类（Sentinel Hub/OSM/WorldKG/Wikidata/GEE）'],
        ['GeoSkill', '可注册GeoSkill', '≥12个（3工具+3知识+6分析）'],
        ['安全合规', '零信任安全网关', '覆盖≥10个国家测绘法规的合规引擎'],
        ['性能指标', '遥感影像智能推荐响应', '≤3秒（从自然语言到数据源组合推荐）'],
        ['性能指标', 'SDG指标在线计算延迟', '≤30秒（单指标、单国家）'],
        ['性能指标', '自修复成功率', '≥92%（Code Agent自修复循环≤3次迭代）'],
    ]
)

add_heading(doc, '5.2 2026年度任务考核技术指标', 2)

add_table(doc,
    ['指标类别', '考核指标', '完成时状态'],
    [
        ['协议标准', 'GeoMCP V2协议草案', '完成握手层/控制层/数据层/事件层四层原语定义'],
        ['协议标准', 'GeoAsset Contract数据模型V1.0', '完成raster/vector两类合约的正式定义'],
        ['平台系统', 'GeoNexus前端系统V1.0', '支持自然语言与地图双向交互'],
        ['平台系统', '可视化工作流编排器原型', '支持≥5种原子能力的拖拽式组装'],
        ['计算引擎', 'CAFE Worker引擎', 'Mekong GeoNode完成Central Server + ≥2个Worker节点部署'],
        ['合约中心', 'GAAG合约注册中心v0.5', '支持scan→metadata→embed→register自动流水线'],
        ['卫星资源', '卫星元数据索引库', '覆盖≥100颗主流对地观测卫星'],
        ['数据产品', '首批基础数据产品', '≥3类（人口/夜间灯光/GDP空间化）'],
        ['知识图谱', 'GeoKG知识图谱', '≥2万实体入库'],
        ['智能体', 'Data Agent原型', '就近数据发现+合约绑定+计算下推决策'],
        ['智能体', 'Code Agent原型', '合约感知代码合成+沙箱执行'],
        ['联邦适配', '首批联邦数据适配器', '≥2类（Sentinel Hub/OSM）'],
        ['示范应用', '首个目标国GeoNode部署', '南非边缘节点上线'],
    ]
)

add_heading(doc, '5.3 知识产权与人才培养指标', 2)
add_body(doc,
    '发表高水平论文不少于7篇；申请发明专利不少于5项；申请软件著作不少于3项；培养博士/'
    '硕士研究生2-4名；培养青年学术骨干或技术带头人3-5名。')

# ===================================================================
# 六、项目预期成果
# ===================================================================
add_heading(doc, '六、项目预期成果', 1)
add_heading(doc, '6.1 总体预期成果', 2)

add_heading(doc, '（1）全球地理信息智能框架（GeoNexus）设计方案', 3)
add_body(doc,
    '形成《GeoNexus全球地理信息智能框架技术方案》和《GeoMCP V2协议规范》各一份，包括'
    'GeoMCP V2四层协议栈规范、GAAG地理资产合约注册中心技术规范、CAFE计算下推引擎架构设计、'
    '双智能体编排引擎设计规范、多源联邦适配器接口标准等核心设计文档。')

add_heading(doc, '（2）GeoNexus智能框架核心平台', 3)
add_body(doc,
    '建成GeoNexus智能框架核心平台一套，包括：GeoMCP V2协议网关（统一API网关，支持'
    'capability discovery、job execution、compute pushdown、cross-federation四类核心操作）；'
    'GAAG合约注册中心（PostGIS + pgvector + Neo4j三重存储，支持合约自动扫描、语义检索、'
    '合约满足度门控）；CAFE计算下推引擎（Central Server任务分发 + Worker就近计算）；双智能体'
    '编排引擎（Data Agent + Code Agent，共享多层记忆）；低代码开发环境（Vue3 + MapLibre + '
    'React Flow可视化工作流编排器）；零信任安全网关（空间法律规则本体库 + 自动合规核验引擎）。')

add_heading(doc, '（3）三大应用服务系统', 3)
add_body(doc,
    '地球观测卫星智能服务系统：全球≥400颗卫星元数据统一索引与动态知识库；多模态智能匹配'
    '引擎；云原生遥感影像智能预处理工具箱；≥5类场景化应用智能体。')
add_body(doc,
    '全球可持续发展评价服务系统：SDG多源数据融合与质量评估工具箱；≥10项SDG指标在线监测、'
    '差距分析与国别诊断；可视化互操作对标平台；系统动力学+多目标优化耦合的模拟推演引擎。')
add_body(doc,
    '地理信息知识库与远程学习系统：GeoKG知识图谱（≥100万实体）；智能检索与个性化学习推荐'
    '引擎；虚拟实训沙盒环境（容器化QGIS + Jupyter）；知识众包共建与长效运营服务体系。')

add_heading(doc, '（4）"一国一策"示范应用', 3)
add_body(doc,
    '完成不少于15个国家的GeoNexus平台示范应用部署，按照L1自主维护/L2协同维护/L3援助维护'
    '三级服务模式，形成可复制的"一国一策"解决方案。')

add_heading(doc, '6.2 服务对象及应用场景', 2)
add_body(doc,
    '项目成果直接服务于UN-GGKIC业务，分为两类应用场景：一是联合国系统业务场景，包括全球'
    '地理信息知识服务、全球地理信息智库建设、全球SDGs实施跟踪、应对全球挑战；二是成员国应用'
    '场景，包括UN-IGIF实施与评价、SDGs实施决策支撑。')

add_heading(doc, '6.3 2026年度预期成果', 2)
add_body(doc,
    '2026年度预期产出：GeoMCP V2协议草案及SDK（Java/Python）；GeoAsset Contract数据模型'
    'V1.0；GAAG合约注册中心v0.5；CAFE Worker引擎原型（Mekong GeoNode）；Data Agent + Code '
    'Agent原型；GeoNexus前端系统V1.0；卫星元数据索引库（≥100颗）；首批≥3类数据产品（人口/'
    '夜间灯光/GDP）；GeoKG知识图谱（≥2万实体）；首个目标国GeoNode边缘节点部署（南非）。')

# ===================================================================
# 七、课题任务分解及主要研究工作
# ===================================================================
add_heading(doc, '七、课题任务分解及主要研究工作', 1)

add_heading(doc, '7.1 课题主要研究工作', 2)

add_heading(doc, '7.1.1 全球地理信息智能框架研发与集成（课题1）', 3)
add_body(doc,
    '本课题作为整个项目的核心底层基础设施，向下屏蔽全球异构数据的物理分布与算力差异，向上'
    '为课题2、3、4提供标准化的通信协议、零信任安全屏障、弹性的计算资源以及低代码的集成交互'
    '环境。核心研究内容包括：')
add_body(doc,
    '（1）GeoMCP V2协议栈与GAAG合约注册中心。研发地理空间数据和模型交互协议栈规范，包括'
    '握手层、控制层、数据层、事件层四层原语定义及核心报文格式规范。在Phase 1 GeoMCP基础上增强'
    'contract_binding、pushdown_spec、federated_sources字段。基于AutoGIS论文GAAG架构，研制'
    'GeoAsset Contract Registry，实现scan→metadata→LLM描述→embed→register自动流水线，采用'
    'PostGIS + pgvector + Neo4j三重存储架构。GeoSkill执行前必须通过Contract Satisfaction Gating '
    '双重验证。')
add_body(doc,
    '（2）默认安全体系与跨域合规协作技术。设计空间法律规则本体库V1.0（≥10国法规），研发'
    '自动合规核验引擎与协议层拦截器。深度整合零信任架构（ZTA）、联邦学习（FL）与安全多方计算'
    '（SMPC）技术，实现"原始数据零下载"的分布式协同分析。')
add_body(doc,
    '（3）低代码智能开发环境与公共产品共享生态。研发前端系统V1.0（Vue3 + MapLibre + React '
    'Flow + deck.gl），突破基于Serverless架构与"计算下推"的算力弹性调度机制，打造支持拖拽式编排'
    '的自定义GeoWorkflow。构建基于社区信任博弈与强化学习的动态信誉评分模型。')

add_heading(doc, '7.1.2 地球观测卫星智能服务系统研发（课题2）', 3)
add_body(doc,
    '聚焦全球空间感知能力的普惠化。研发适用于全球对地观测资源的专用互联协议，兼容CEOS-'
    'WGISS、OGC等主流标准，实现全球不少于400颗主要卫星资源的统一标识与动态接入。构建动态'
    '更新的全球遥感卫星知识库与高精度星历数据库，研发基于大语言模型的多模态智能匹配引擎。研发'
    '部署于云端的遥感影像智能预处理工具箱，支持主流光学及SAR卫星数据的标准化处理。面向农业估产、'
    '森林监测、灾害评估等典型领域开发场景化应用智能体，封装为应用卡片实现全流程自动化。')

add_heading(doc, '7.1.3 全球可持续发展评价服务系统研发（课题3）', 3)
add_body(doc,
    '系统构建覆盖"数据基础-分析工具-决策支持"全链条的SDG智能评估与决策支持体系。研制统计'
    '数据与空间数据的融合算法工具箱，构建多源数据质量评估体系。开发灵活调用的SDG预置分析模块，'
    '构建基于"问题-措施-数据-成效"逻辑的SDG最佳实践案例库。建立支持跨系统数据与结果互操作的'
    '国别对标平台。集成系统动力学模型与多目标优化算法，构建"SDG推演一张图"仪表板，支持多情景'
    '模拟与自动生成结构化政策分析报告。')

add_heading(doc, '7.1.4 地理信息知识库与远程学习系统研发（课题4）', 3)
add_body(doc,
    '聚焦"知识如何转化为能力"核心问题。构建涵盖"概念-方法-工具-案例-场景"的多维知识图谱模型'
    '（GeoKG四层本体：实体层→属性层→关系层→规则层）。研发LLM知识抽取流水线：文档解析→实体'
    '抽取→关系抽取→实体对齐→图谱注入→规则抽取。建立分级分类的课程体系与学习路径动态匹配机制。'
    '构建容器化虚拟实训沙盒环境（QGIS + Jupyter）。建立"感知-识别-众包-质检"更新框架与"基础服务'
    '免费+增值服务支持"的可持续运营模式。')

add_heading(doc, '7.2 课题任务分解', 2)

add_heading(doc, '课题1：全球地理信息智能框架研发与集成', 3)
add_table(doc,
    ['序号', '子任务名称', '主要研究内容'],
    [
        ['1', '地理空间数据和模型交互标准化',
         '设计GeoMCP V2协议栈四层原语定义及核心报文格式规范；研制跨平台通信套件（Java/Python SDK）；研发实时数据流接入原型，支持≥3类数据源统一接入'],
        ['2', 'GAAG地理资产合约注册中心',
         '设计GeoAsset Contract数据模型；实现scan→metadata→LLM描述→embed→register自动流水线；构建PostGIS+pgvector+Neo4j三重存储；研发Contract Satisfaction Gating合约校验模块'],
        ['3', 'CAFE计算下推与Worker引擎',
         'GeoNode重构为Central Server + N×Worker模式；实现Pushdown Protocol智能路由；研发Serverless弹性调度与计算预热机制'],
        ['4', '默认安全体系与跨域合规协作',
         '设计空间法律规则本体库V1.0（≥10国法规）；研发自动合规核验引擎与协议层拦截器；建立统一单点登录与权限管理框架；开展FL/SMPC技术选型'],
        ['5', '低代码智能开发环境与公共产品共享生态',
         '研发前端系统V1.0（Vue3+MapLibre+React Flow）；开发可视化工作流编排器原型（≥5种原子能力拖拽式组装）；研发通用预训练智能体矩阵V1.0；构建低代码组件库基础版'],
    ]
)

add_heading(doc, '课题2：地球观测卫星智能服务系统研发', 3)
add_table(doc,
    ['序号', '子任务名称', '主要研究内容'],
    [
        ['1', '卫星资源互联与知识库构建',
         '汇聚整合跨机构卫星元数据，建成覆盖≥100颗卫星的元数据索引仓库（Elasticsearch/PostGIS）；研发可视化检索面板，支持按时间段/云量/BBox精准过滤；建立与国际组织的元数据同步机制'],
        ['2', '遥感数据智能处理与检校',
         '研发云原生预处理工具箱（辐射定标/大气校正/几何精校正/云检测/影像融合）；开发COG金字塔切片与轻量化瓦片服务；支持自定义区域/波段/格式的实时裁剪封装'],
        ['3', '场景化智能体与开放服务',
         '开展灾害场景响应数据挂载测试；定向挂载SAR影像/DEM/社会经济等核心数据集；验证数据推荐链路，实现秒级检索与前端关联展示；封装为标准化API与微服务'],
    ]
)

add_heading(doc, '课题3：全球可持续发展评价服务系统研发', 3)
add_table(doc,
    ['序号', '子任务名称', '主要研究内容'],
    [
        ['1', 'SDG多源数据融合与质量评估工具箱',
         '构建多源数据融合展示底图，集成人口分布/不透水层等基础公开数据；配合课题1安全网关完成数据调取流程中主权协议确认与水印展示逻辑；预留合规审计界面'],
        ['2', '可视化评估与互操作平台',
         '开发前端高性能Vector Tiles瓦片渲染引擎；研发SDG动态仪表盘V1.0（时间序列折线图/指标对比雷达图/空间热力图）；支持可定制的国别≥10个核心指标可视化'],
        ['3', '模拟推演与决策支持',
         '基于系统动力学完成人口/经济与SDG关联核心子系统的因果反馈网络构建；实现系统动力学模型与多目标优化算法的初步耦合'],
    ]
)

add_heading(doc, '课题4：地理信息知识库与远程学习系统研发', 3)
add_table(doc,
    ['序号', '子任务名称', '主要研究内容'],
    [
        ['1', '地理信息知识库与知识图谱体系化构建',
         '研发知识图谱可视化漫游组件（力导向图三维展示/节点动态加载/关系扩展）；研究图谱前端性能优化与分布式数据调度机制；构建"实体-属性-关系-规则"四层本体'],
        ['2', '情景化智能学习模块设计研发',
         '建立分级分类课程体系；研发学习路径动态匹配与个性化推荐引擎；设计情景化学习任务（城市治理/防灾减灾）；构建容器化虚拟实训沙盒环境（QGIS+Jupyter）'],
        ['3', '知识众包与长效运营模式',
         '建立标准化案例提交与审核流程；构建"感知-识别-众包-质检"更新框架；搭建线上研讨与专题交流机制；确立"基础免费+增值支持"可持续运营模式'],
    ]
)

# ===================================================================
# 八、项目各课题接口关系
# ===================================================================
add_heading(doc, '八、项目各课题接口关系', 1)

add_heading(doc, '8.1 课题与项目的接口关系', 2)
add_body(doc,
    '本项目《全球地理信息智能框架及服务系统研发》和项目《全球地理信息公共产品研制》同属于'
    '专项《全球地理信息公共产品关键技术研发与应用》。本项目侧重于构建开放、安全、普惠的全球'
    '地理信息智能框架（GeoNexus），为公共产品提供枢纽化的服务系统与开放协同的技术生态。本项目'
    '为公共产品项目提供平台载体与服务能力，公共产品项目为本平台提供内容供给与数据支撑。')

add_heading(doc, '8.2 课题之间接口关系', 2)
add_body(doc,
    '课题1（智能框架）↔ 课题2（卫星服务）：课题1为课题2提供GeoMCP V2协议网关、GAAG合约'
    '注册与校验、CAFE计算下推引擎、低代码可视化编排环境。课题2的卫星资源互联协议需兼容GeoMCP '
    'V2规范，场景化智能体需注册至GAAG合约中心，遥感预处理工具箱需适配CAFE Worker就近计算模式。')
add_body(doc,
    '课题1（智能框架）↔ 课题3（SDG评价）：课题1为课题3提供零信任安全网关（数据主权合规核验）、'
    'Serverless弹性算力调度（高并发指标计算）、低代码仪表盘组件库。课题3的数据融合算法需通过'
    'GeoMCP V2协议接入多源联邦数据，SDG指标计算GeoSkill需通过Contract Satisfaction Gating校验。')
add_body(doc,
    '课题1（智能框架）↔ 课题4（知识学习）：课题1为课题4提供GeoKG知识图谱底层存储（Neo4j+'
    'pgvector）、大模型API统一网关、虚拟实训容器化调度。课题4的知识抽取流水线需注册为GeoMCP '
    'Workflow，知识众包更新需通过GAAG合约版本管理。')
add_body(doc,
    '课题2（卫星服务）→ 课题3（SDG评价）：课题2产出的标准化遥感数据产品（地表覆盖/夜间灯光/'
    '植被指数等）直接输送给课题3作为SDG指标计算的客观数据底盘。课题2的场景化智能体分析结果输入'
    '课题3的模拟推演引擎。')
add_body(doc,
    '课题2+3 → 课题4（知识学习）：课题2、3中沉淀的平台操作方法、智能化算子与真实评估案例，'
    '转化为课题4的体系化知识图谱与实训课程。课题4在示范应用中产生的用户反馈与本土化需求，逆向'
    '传递至前序课题，驱动框架、算法和产品的持续优化。')

add_heading(doc, '8.3 关键接口规划', 2)

add_table(doc,
    ['接口编号', '接口名称', '协议', '提供方', '消费方', '实现季度'],
    [
        ['IF-01', 'GeoCapability注册', 'GeoMCP /register', '课题1', '框架基座', 'Q1'],
        ['IF-02', 'GeoCapability发现', 'GeoMCP /discover', '框架基座', 'All', 'Q1'],
        ['IF-03', '合约注册', 'POST /api/contracts', '课题1/2', 'GAAG', 'Q2'],
        ['IF-04', '合约校验', 'POST /api/contracts/validate', 'GAAG', 'GeoSkill执行', 'Q2'],
        ['IF-05', 'GeoSkill执行', 'GeoMCP /execute', '框架基座', '课题1/3/4', 'Q3'],
        ['IF-06', 'Workflow编排', 'Temporal Workflow', '框架基座', '课题1/4', 'Q2'],
        ['IF-07', 'KG查询', 'SPARQL/Cypher', 'GeoKG', '课题3/4', 'Q3'],
        ['IF-08', '联邦数据接入', 'Adapter Protocol', '多源适配器', '课题1/2/4', 'Q3'],
        ['IF-09', '策略执行', 'OPA REST', 'GeoFederation', 'All', 'Q4'],
        ['IF-10', '审计日志', 'OpenTelemetry', '框架基座', 'All', 'Q4'],
        ['IF-11', '计算下推', 'Pushdown Protocol', 'CAFE Engine', '课题1/2', 'Q2'],
        ['IF-12', '自修复反馈', 'Repair Protocol', 'Code Agent', 'GeoSkill执行', 'Q4'],
    ]
)

# ===================================================================
# 九、项目实施关键节点与具体实施计划
# ===================================================================
add_heading(doc, '九、项目实施关键节点与具体实施计划', 1)

add_heading(doc, '9.1 项目总体实施框架', 2)
add_body(doc,
    '本项目按照"需求牵引、体系设计、技术突破、平台研发、集成示范"的逻辑展开，三年分三个阶段推进：')
add_body(doc,
    '2026年（基础构建期）：Phase 1原型 → Phase 2 Alpha。完成GeoMCP V2协议草案、GAAG合约'
    '注册中心v0.5、CAFE Worker引擎原型、Data Agent + Code Agent原型、GeoNexus前端V1.0、卫星'
    '元数据索引库（≥100颗）、首批数据产品（≥3类）、GeoKG知识图谱（≥2万实体）、首个目标国'
    'GeoNode部署。')
add_body(doc,
    '2027年（深化完善期）：Alpha → Beta。QGIS-GPT 32B适配GeoNexus、≥20类SDGs指标上线、'
    'GeoKG ≥50万实体、自修复成功率≥92%、≥5个GeoWorkflow生产级运行、零信任安全网关全面就绪。')
add_body(doc,
    '2028年（集成收尾期）：Beta → 业务化运行。≥400颗卫星集成、GeoKG ≥100万实体、UN-GGKIC '
    '正式业务承载、≥15个国家示范应用完成、长效运营体系确立。')

add_heading(doc, '9.2 2026年度季度任务分解', 2)

quarter_data = [
    ('Q1（1-3月）：协议夯实与原型评估', [
        ['课题1', 'GeoMCP V2协议草案（四层原语+contract_binding/pushdown_spec/federated_sources）；GeoAsset Contract数据模型设计；Phase 1代码全面评审；Vue3/MapLibre前端技术选型'],
        ['课题2', '卫星元数据模型设计；Sentinel/Landsat API接入调研；遥感预处理工具技术选型'],
        ['课题3', 'SDGs知识体系框架；GeoKG四层本体设计（实体-属性-关系-规则）；系统动力学模型技术选型'],
        ['课题4', '非洲10国基础数据调研；GeoNode部署拓扑设计；UN-GGKIC对接计划'],
    ]),
    ('Q2（4-6月）：CAFE引擎与合约注册中心', [
        ['课题1', 'GeoNode Central Server + Worker节点实现；Pushdown Protocol智能路由；Contract Gating合约校验模块；GAAG自动扫描器（scan→metadata→LLM→embed）'],
        ['课题2', '卫星元数据索引库建设（≥100颗）；可视化检索面板；pgvector语义检索集成'],
        ['课题3', 'SDGs监测评估知识体系建模；规则推理引擎（Neo4j GDS）；IGIF知识抽取启动'],
        ['课题4', '首个目标国GeoNode边缘节点部署（南非）'],
    ]),
    ('Q3（7-9月）：多源联邦与智能体原型', [
        ['课题1', 'Sentinel Hub/OSM首批联邦适配器；Spring Boot控制平面搭建v0.1；Data Agent原型（就近数据发现+合约绑定+计算下推决策）'],
        ['课题2', '遥感智能预处理工具箱原型；场景化智能体框架搭建'],
        ['课题3', 'GeoKG ≥2万实体入库；LLM知识抽取流水线；IGIF/国土空间规划知识建模'],
        ['课题4', '非洲5国数据整合精化；第二个Edge GeoNode部署（肯尼亚）'],
    ]),
    ('Q4（10-12月）：智能体集成与年度收尾', [
        ['课题1', 'Code Agent实现（合约感知代码合成+沙箱执行）；自修复循环（≤3次迭代）；双智能体共享多层记忆；≥12个GeoSkill全部封装注册；WorldKG/Wikidata/GEE三类联邦适配器补充'],
        ['课题2', '灾害场景应用智能体完整链路验证；数据推荐链路秒级检索达标；标准化API封装'],
        ['课题3', '三大知识产品构建完成（SDGs/IGIF/国土空间规划）；SDG仪表盘V1.0上线；模拟推演引擎原型验证'],
        ['课题4', '"一国一图"非洲10国首版数据库；与UN-GGKIC联合评测'],
    ]),
]
for title, rows in quarter_data:
    add_heading(doc, title, 3)
    add_table(doc, ['课题', '主要任务'], rows)

add_heading(doc, '9.3 Phase 1 → Phase 2 代码迁移路径', 2)

add_table(doc,
    ['Phase 1（当前）', 'Phase 2（2026 Q4目标）'],
    [
        ['server.js（Node.js，单进程，SQLite）', 'server.js（API网关）+ Spring Boot（控制平面）'],
        ['app.js（原生JS SPA）', 'Vue3 + MapLibre + React Flow + deck.gl'],
        ['data/registry.json（静态种子JSON）', 'GAAG Contract Registry（PostGIS + pgvector + Neo4j）'],
        ['GeoNode Runtime（单进程FastAPI）', 'GeoNode V2（CAFE模式：Central + N×Worker）'],
        ['Temporal（scaffolded）', 'Temporal（生产级≥5种GeoWorkflow）'],
        ['模拟jobTimers（setInterval）', 'Temporal Activity + Heartbeat（真实长时任务）'],
        ['1个GeoSkill（flood-impact）+ 2个registry-only', '≥12个GeoSkill（3工具+3知识+6分析）'],
        ['1个Node.js依赖文件', 'package.json + requirements.txt + pom.xml（三语言）'],
        ['无前端构建工具', 'Vite + TypeScript + Pinia'],
    ]
)

# ===================================================================
# 十、项目具体技术路线
# ===================================================================
add_heading(doc, '十、项目具体技术路线', 1)

add_heading(doc, '10.1 课题1：全球地理信息智能框架研发与集成', 2)

add_heading(doc, '10.1.1 总体技术路线', 3)
add_body(doc,
    '课题1遵循"标准引领→安全筑基→引擎驱动→生态聚合"的递进逻辑。子任务1从通信协议栈底层'
    '定义GeoMCP V2交互规范与GAAG合约元模型，为整个框架提供标准化的"通用语言"；子任务2在此'
    '通信管道上加装零信任安全锁与跨域合规引擎；子任务3通过CAFE计算下推与Serverless弹性调度，'
    '构建"数据不动计算动"的高性能执行环境，并通过低代码可视化编排器将底层能力封装为拖拽式工作流，'
    '最终形成开放协同的GeoNexus智能框架生态。')

add_heading(doc, '10.1.2 GeoMCP V2协议栈设计', 3)
add_body(doc,
    'GeoMCP V2协议栈在Phase 1 GeoMCP基础上进行深度增强，分为四层原语：握手层（Discovery & '
    'Handshake Layer），包括capability.announce、capability.discover、contract.bind，新增字段'
    'contract_binding、federated_sources；控制层（Control & Scheduling Layer），包括job.create/'
    'status/cancel、pushdown.negotiate、schedule.route，新增字段pushdown_spec；数据层（Data & '
    'Stream Layer），包括data.stream、federated.query、pushdown.execute，强制约束原始数据不出域；'
    '事件层（Event & Audit Layer），包括event.heartbeat、event.audit、event.alert，符合OpenTelemetry规范。')

add_heading(doc, '10.1.3 GAAG合约注册中心', 3)
add_body(doc,
    '参考AutoGIS论文GAAG架构，本土化为GeoNexus的GeoAsset Contract Registry。自动扫描流水线：'
    '原始数据→格式归一化→元数据提取（rasterio/GDAL）→LLM描述生成（Qwen72B）→向量嵌入（pgvector）'
    '→合约注册（PostGIS）。Contract Data Model包含contract_id、asset_type、spatial（CRS/bbox/'
    'resolution）、temporal（start/end/interval）、bands（count/names/dtype）、semantic_embedding、'
    'provenance等字段。Contract Satisfaction Gating实施双重验证：语义相似度（pgvector cosine '
    'similarity ≥ 0.85）+ 合约一致性验证（CRS匹配/bbox重叠/波段检查/时间覆盖）。')

add_heading(doc, '10.1.4 CAFE计算下推引擎', 3)
add_body(doc,
    '每个GeoNode重构为"Central Server + N×Worker节点"的CAFE模式。Central Server负责接收GeoMCP '
    '任务请求、解析GeoAsset Contract确定数据位置、智能路由选择最优Worker、任务分片与结果聚合。'
    'Worker节点负责管理本地数据分片（PostGIS + COG GeoTIFF + Zarr）、执行下推的计算代码（沙箱隔离）、'
    '返回聚合统计结果（非原始数据）、心跳上报与健康检查。Pushdown Protocol流程：Client→Central '
    'Server→GAAG发现合约→Router选择Worker→Worker本地计算→结果聚合→Client。')

add_heading(doc, '10.1.5 双智能体编排引擎', 3)
add_body(doc,
    'Data Agent（CAFE思维）：就近数据发现 + 合约语义检索 + 计算下推决策。工作流：接收自然语言'
    '需求→GAAG语义搜索→合约满足度验证→确定数据位置→决策本地计算vs数据迁移。Code Agent（AutoGIS '
    '思维）：合约感知代码合成 + 沙箱安全执行 + 自修复循环。工作流：接收合约绑定上下文→检索相似'
    'GeoSkill模板→LLM合成分析代码→Sandbox执行→错误捕获→自修复（≤3次迭代）。共享多层记忆：'
    'Working Memory（当前任务上下文）、Episodic Memory（历史任务经验）、Semantic Memory（领域知识'
    '嵌入）、Procedural Memory（操作流程模式）。')

add_heading(doc, '10.1.6 零信任安全网关', 3)
add_body(doc,
    '空间法律规则本体库：将各国测绘地理信息法规形式化为机器可读的OPA策略规则，覆盖中国、欧盟、'
    '美国、巴西、印度、南非、肯尼亚、尼日利亚、印度尼西亚、越南等≥10个国家/地区。自动合规核验引擎：'
    '基于GeoMCP请求中的地理位置、数据敏感度标签、用户身份与角色，实时执行OPA策略评估，实现毫秒级'
    '合规判定。"数据可用不可见"实现：联邦学习（模型梯度交换）、安全多方计算（多方联合统计）、差分'
    '隐私（聚合结果添加校准噪声）、数据水印（所有输出结果嵌入可追溯水印）。')

add_heading(doc, '10.2 课题2：地球观测卫星智能服务系统研发', 2)
add_body(doc,
    '课题2遵循"资源接入→智能处理→场景封装"的递进逻辑。统一元数据模型兼容CEOS-WGISS、OGC CSW、'
    'STAC等国际标准。多模态智能匹配引擎流程：用户自然语言输入→LLM任务解析（事件类型/地点/时空范围/'
    '传感器类型）→知识库检索匹配→多目标优化排序（数据完整性×时空覆盖×用户评价×获取便捷性）→推荐'
    '输出最优数据源组合。云原生预处理工具箱采用模块化架构，包括辐射定标、大气校正（6S模型+Py6S）、'
    '几何精校正、云与阴影检测（FMask改进）、影像融合与镶嵌等模块，自动生成COG格式与多级金字塔。')

add_heading(doc, '10.3 课题3：全球可持续发展评价服务系统研发', 2)
add_body(doc,
    '课题3遵循"数据融合→指标计算→情景模拟→决策支持"的全链条逻辑。SDG多源数据融合引擎采用分层'
    '随机森林降尺度+队列要素法推演+多维地理协变量约束。可视化互操作对标平台包括Vector Tiles高性能'
    '瓦片渲染、D3/ECharts动态仪表盘（时间序列折线图+指标对比雷达图+空间热力图+国别差距分析图）。'
    'SDGs模拟推演引擎耦合系统动力学模型（人口-经济-资源-环境因果反馈网络）与多目标优化算法（NSGA-'
    'III求解Pareto前沿），构建交互式"推演一张图"仪表板，支持≥8个政策变量的滑块式调节与多情景对比。')

add_heading(doc, '10.4 课题4：地理信息知识库与远程学习系统研发', 2)
add_body(doc,
    '课题4遵循"知识建模→能力生成→长效运营"的逻辑。GeoKG四层本体模型：实体层（Country/SDG_'
    'Indicator/GeoDataProduct/GeoSkill/Policy/Case）→属性层→关系层（supports/governs/depends_on/'
    'benchmarks_against）→规则层（IF-THEN推理规则）。LLM知识抽取流水线：文档解析（PDF/DOCX/HTML）'
    '→实体抽取（NER+RE）→关系抽取→实体对齐（跨文档消歧）→图谱注入（Neo4j/Cypher）→规则抽取'
    '（Neo4j GDS）。个性化学习推荐基于能力分级（L1基础→L2专业→L3综合）与知识图谱驱动的最短路径'
    '算法。"感知-识别-众包-质检"更新框架：Sentinel变化检测→微任务自动生成（Tile-based）→移动端App'
    '众包验证→多人交叉验证（Fleiss\' Kappa ≥ 0.6）→自动更新/专家复核。')

# ===================================================================
# 十一、项目团队与经费预算
# ===================================================================
add_heading(doc, '十一、项目团队与经费预算', 1)

add_heading(doc, '11.1 项目基本信息', 2)
add_table(doc,
    ['项目', '内容'],
    [
        ['项目名称', '全球地理信息智能框架及服务系统研发'],
        ['所属专项', '全球地理信息公共产品关键技术研发与应用'],
        ['项目类型', '应用示范研究'],
        ['经费总需求', '2730万元'],
        ['执行周期', '2026年1月—2028年12月，共36个月'],
        ['实验室牵头二级科研机构', '全球可持续发展研究院'],
    ]
)

add_heading(doc, '11.2 项目负责人', 2)
add_table(doc,
    ['项目', '内容'],
    [
        ['项目负责人1', '彭舒（高级职称，硕士）'],
        ['项目负责人2', '杨木（博士）'],
        ['项目联系人', '吕子川'],
    ]
)

add_heading(doc, '11.3 课题分解与经费', 2)
add_table(doc,
    ['序号', '课题名称', '课题牵头部门', '课题负责人', '任务总经费（万元）'],
    [
        ['1', '全球地理信息智能框架研发与集成', '全球可持续发展研究院', '杨木', '663.52'],
        ['2', '地球观测卫星智能服务系统研发', '全球可持续发展研究院', '吕子川', '642.97'],
        ['3', '全球可持续发展评价服务系统研发', '全球可持续发展研究院', '何兴华', '657.43'],
        ['4', '地理信息知识库与远程学习系统研发', '全球可持续发展研究院', '邵克俭', '766.08'],
    ]
)

# ===================================================================
# 十二、主要创新点
# ===================================================================
add_heading(doc, '十二、主要创新点', 1)

innovations = [
    ('创新点一：GeoMCP V2——首个面向地理空间智能体交互的标准化协议栈。',
     '在通用MCP协议基础上，首次定义了空间物理基准（CRS/bbox/geometry）的原生协议语义，增强'
     'contract_binding、pushdown_spec、federated_sources三类地理专属字段，实现跨域地理资源的'
     '"即插即用"式互联互通。融合零信任架构与空间法律规则本体库，实现毫秒级的跨国合规自动核验。'),
    ('创新点二：CAFE计算下推与"零数据下载"联邦协同机制。',
     '首次将CAFE的"计算移动至数据端"范式工程化实现于全球地理信息服务平台，通过Central Server + '
     'Worker就近计算模式与Pushdown Protocol智能路由，从根本上解决PB级遥感数据的跨洲际传输瓶颈。'
     '结合联邦学习与安全多方计算，实现"数据可用不可见"的跨域协同分析。'),
    ('创新点三：合约驱动的双智能体编排与自修复循环。',
     '融合AutoGIS的合约驱动理念，构建Data Agent（合约感知数据发现+下推决策）+ Code Agent（合约感知'
     '代码合成+自修复≤3次迭代）的双智能体协同架构。通过Contract Satisfaction Gating确保数据-算法的'
     '一致性，通过共享多层记忆（Working/Episodic/Semantic/Procedural）实现智能体的持续进化。'),
    ('创新点四：GAAG地理资产合约注册中心——数据产品的"身份证"系统。',
     '每个数据产品同步生成包含CRS/bbox/bands/temporal/resolution的机器可读Data Contract，实现从'
     '"人工找数据"到"合约自动匹配"的范式转变。自动扫描流水线（scan→metadata→LLM→embed→register）'
     '使新增数据产品可被即时发现与调用。'),
    ('创新点五：从"一国一图"到"一国一策"的L1/L2/L3三级服务模式。',
     '首次提出基于GeoNode联邦部署的三级差异化服务模式，适配不同国家/地区的基础设施与技术能力水平，'
     '实现从"统一供给"到"按需适配"的服务范式创新。'),
]
for title, desc in innovations:
    add_body(doc, title + desc)

# ===================================================================
# 十三、预期经济社会效益
# ===================================================================
add_heading(doc, '十三、预期经济社会效益', 1)

add_heading(doc, '13.1 社会效益', 2)
add_body(doc,
    '直接支撑UN-GGKIC的核心业务能力建设，为全球南方国家提供高质量、易获取的地理信息智能服务；'
    '有效弥合数字鸿沟，助力发展中国家提升自主落实2030年可持续发展议程的能力；推动中国地理信息技术'
    '与标准走向全球合作舞台，提升在国际地理信息领域的话语权；为构建人类命运共同体提供精准、高效、'
    '普惠的空间信息支撑。')

add_heading(doc, '13.2 经济效益', 2)
add_body(doc,
    '通过"基础服务免费+增值服务支持"的运营模式，形成可持续的平台经济生态；降低发展中国家获取和'
    '使用地理信息技术的成本，释放数字经济潜力；促进我国地理信息产业的国际化发展，带动相关技术出口与'
    '服务输出；为全球地理信息公共产品市场培育标准化、规模化的技术生态。')

# ===================================================================
# 参考文献
# ===================================================================
add_heading(doc, '参考文献', 1)

refs = [
    '1. Xu H, Li S, Bai Y, et al. A collaborative analysis framework for distributed gridded environmental data. Environmental Modelling & Software, 2018. DOI: 10.1016/j.envsoft.2018.09.007',
    '2. Chen Z, Zhang X, Li J, et al. AutoGIS: An Agent Framework for Automated Geospatial Data Management and Analysis. Tsinghua University, 2025.',
    '3. Anthropic. Model Context Protocol: An open standard for connecting AI tools to data sources. 2025.',
    '4. 武昊，陈军，田海波 等. 全球地理信息公共产品研发的技术发展方向与主要任务. 时空信息学报，2023，30(2)，157-166.',
    '5. 陈军，彭舒，赵学胜 等. 顾及地理空间视角的区域SDGs综合评估方法与示范. 测绘学报，2019，48(4)，473-479.',
    '6. Lin Q, Hu R, Li H, et al. GeoJSON agents: A Multi-Agent Large Language Model Framework for Automated Geospatial Analysis. International Journal of Digital Earth, 2026.',
    '7. Guo X, Lao J, Dang B, et al. SkySense: A Multi-Modal Remote Sensing Foundation Model Towards Universal Interpretation for Earth Observation Imagery. CVPR, 2024.',
    '8. Hou Y, et al. Design and application of a semantic-driven geospatial modeling knowledge graph based on LLMs. International Journal of Digital Earth, 2024.',
    '9. Deng et al. K2: A Foundation Model for Earth Science. 2024.',
    '10. Bian. Continuous Self-Learning Knowledge Base System Based on KG-LLM Dual-Core and Crowdsourcing Collaboration. 2025.',
    '11. Xui H, et al. On the Evolution of Knowledge Graphs: A Survey and Perspective. IEEE TKDE, 2024.',
    '12. UN-GGIM. Integrated Geospatial Information Framework. 2018.',
    '13. Gorelick N, et al. Google Earth Engine: Planetary-scale geospatial analysis for everyone. Remote Sensing of Environment, 2017.',
]

for ref in refs:
    para = doc.add_paragraph()
    run = para.add_run(ref)
    set_run_font(run, FONT_BODY, SIZE_REF)
    set_para_fmt(para, line_spacing=1.15, first_line_indent=None)

# ===================================================================
# SAVE
# ===================================================================
output_path = '/Users/mac/Repos/GeoNexus/docs/implementation-plan.docx'
doc.save(output_path)
print(f'DOCX saved to: {output_path}')
print('Done.')
