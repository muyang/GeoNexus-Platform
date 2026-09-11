#!/usr/bin/env python3
"""
Build the enhanced version of 全球地理信息智能框架及服务系统研发（main）-enhanced.docx
with comprehensive task decomposition, inter-task relationships, engineering-level
technical routes, and detailed implementation roadmap.
"""

from docx import Document
from docx.shared import Pt, Inches, Cm, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml.ns import qn
from docx.oxml import OxmlElement
import copy

# ============================================================
# Helper functions
# ============================================================

def add_heading_styled(doc, text, level=1):
    """Add heading with proper Chinese font settings."""
    h = doc.add_heading(text, level=level)
    for run in h.runs:
        run.font.name = 'SimHei'
        run._element.rPr.rFonts.set(qn('w:eastAsia'), 'SimHei')
    return h

def add_para(doc, text, bold=False, font_name='SimSun', size=12, alignment=None, space_after=6):
    """Add a body paragraph with Chinese font."""
    p = doc.add_paragraph()
    run = p.add_run(text)
    run.font.name = font_name
    run._element.rPr.rFonts.set(qn('w:eastAsia'), font_name)
    run.font.size = Pt(size)
    run.bold = bold
    if alignment is not None:
        p.alignment = alignment
    pf = p.paragraph_format
    pf.space_after = Pt(space_after)
    pf.first_line_indent = Cm(0.74)  # ~2 chars
    return p

def add_code_block(doc, code_text):
    """Add a monospace code block."""
    p = doc.add_paragraph()
    run = p.add_run(code_text)
    run.font.name = 'Courier New'
    run.font.size = Pt(9)
    pf = p.paragraph_format
    pf.space_after = Pt(4)
    pf.left_indent = Cm(1)
    return p

def set_cell_font(cell, text, bold=False, size=9):
    """Set cell text with proper font."""
    cell.text = ''
    p = cell.paragraphs[0]
    run = p.add_run(text)
    run.font.name = 'SimSun'
    run._element.rPr.rFonts.set(qn('w:eastAsia'), 'SimSun')
    run.font.size = Pt(size)
    run.bold = bold

def add_table_with_header(doc, headers, rows, col_widths=None):
    """Add a formatted table."""
    table = doc.add_table(rows=1 + len(rows), cols=len(headers))
    table.style = 'Table Grid'
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    # Header
    for i, h in enumerate(headers):
        cell = table.rows[0].cells[i]
        set_cell_font(cell, h, bold=True, size=9)
        # Shade header
        shading = OxmlElement('w:shd')
        shading.set(qn('w:fill'), '2F5496')
        shading.set(qn('w:val'), 'clear')
        cell._element.get_or_add_tcPr().append(shading)
        for run in cell.paragraphs[0].runs:
            run.font.color.rgb = RGBColor(255, 255, 255)
    # Data rows
    for r, row in enumerate(rows):
        for c, val in enumerate(row):
            if c < len(headers):
                cell = table.rows[r+1].cells[c]
                set_cell_font(cell, str(val), size=8)
    if col_widths:
        for i, w in enumerate(col_widths):
            for row in table.rows:
                row.cells[i].width = Cm(w)
    doc.add_paragraph()  # spacer
    return table

# ============================================================
# Main builder
# ============================================================

def build_enhanced_document():
    doc = Document()

    # Set default font
    style = doc.styles['Normal']
    font = style.font
    font.name = 'SimSun'
    font.size = Pt(12)
    style.element.rPr.rFonts.set(qn('w:eastAsia'), 'SimSun')

    # ========================================
    # TITLE
    # ========================================
    title = doc.add_paragraph()
    title.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = title.add_run('全球地理信息智能框架及服务系统研发')
    run.font.name = 'SimHei'
    run._element.rPr.rFonts.set(qn('w:eastAsia'), 'SimHei')
    run.font.size = Pt(22)
    run.bold = True

    subtitle = doc.add_paragraph()
    subtitle.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = subtitle.add_run('（GeoNexus）\n实施方案')
    run.font.name = 'SimHei'
    run._element.rPr.rFonts.set(qn('w:eastAsia'), 'SimHei')
    run.font.size = Pt(16)

    org = doc.add_paragraph()
    org.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = org.add_run('莫干山地信实验室\n二〇二六年五月')
    run.font.name = 'SimSun'
    run._element.rPr.rFonts.set(qn('w:eastAsia'), 'SimSun')
    run.font.size = Pt(12)

    doc.add_page_break()

    # ========================================
    # 项目概要
    # ========================================
    add_heading_styled(doc, '项目概要', level=1)

    add_para(doc, '本项目"全球地理信息智能框架及服务系统研发"（GeoNexus）与"全球地理信息公共产品研制"同属于专项"全球地理信息公共产品关键技术研发与应用"，共同围绕"研制全球地理信息公共产品，推进建成开放、普惠、安全的全球地理信息知识与创新服务枢纽，支撑联合国全球地理信息知识与创新中心（UN-GGKIC），服务全球新型治理体系建设"的总体目标。')

    add_para(doc, '本项目侧重于构建开放、安全、普惠的全球地理信息智能框架，并基于该框架研发地球观测卫星智能服务系统、全球可持续发展评价系统、地理信息知识库与远程学习系统，打通从"底层算力数据"到"顶层应用赋能"的全链路。项目采用"一基座、三应用"的（1+3）总体架构，系统性地分解为四个高度关联、相互支撑的课题：')

    subjects = [
        ('课题1', '全球地理信息智能框架研发与集成', '663.52万元', '杨木'),
        ('课题2', '地球观测卫星智能服务系统研发', '642.97万元', '吕子川'),
        ('课题3', '全球可持续发展评价服务系统研发', '657.43万元', '何兴华'),
        ('课题4', '地理信息知识库与远程学习系统研发', '766.08万元', '邵克俭'),
    ]

    add_table_with_header(doc,
        ['序号', '课题名称', '任务总经费', '课题负责人'],
        [[str(i+1), name, funds, lead] for i, (_, name, funds, lead) in enumerate(subjects)],
        [1.0, 8.0, 2.5, 2.0])

    add_para(doc, '项目总经费2730万元，执行周期2026年1月至2028年12月（共36个月）。')

    add_para(doc, '本项目深度融合三种设计哲学形成统一技术架构：（1）CAFE分布式计算范式（清华，Xu & Bai et al., 2018）——"计算移动至数据端"、Worker就近执行、零原始数据下载；（2）AutoGIS双智能体架构（清华，Chen, Bai & Li et al., 2025）——合约驱动的Data Agent + Code Agent、GAKG知识图谱、自修复循环；（3）GeoMCP V2协议——在已有Phase 1 GeoMCP基础上增强contract_binding、pushdown_spec、federated_sources字段，成为跨三层统一通信总线。')

    doc.add_page_break()

    # ========================================
    # 一、研究背景
    # ========================================
    add_heading_styled(doc, '一、研究背景', level=1)

    add_para(doc, '当前，全球数字化转型与可持续发展进程的深度融合，正推动地理信息服务从"数据供应"向"智能决策"范式跃迁。然而，广大发展中国家在利用地理信息技术监测联合国《2030年可持续发展议程》、应对气候变化与灾害应急等共同挑战时，正面临着从"数字鸿沟"向"智能鸿沟"加速演化的现实困境。一方面，全球地理空间资源高度分散于不同主权主体与异构系统之中，缺乏统一的交互语言与互操作机制，导致多源数据融合成本居高不下；另一方面，以大语言模型为代表的新一代人工智能技术在地理空间垂直应用中存在显著的"语义鸿沟"，通用大模型难以精准理解并调用坐标系变换、缓冲区分析等专业空间计算工具。上述技术瓶颈与发展中国家基础设施薄弱、专业人才匮乏的现状形成叠加效应，使得获取地理信息难、使用技术工具门槛高、获得专业知识服务匮乏，成为制约全球南方国家可持续发展的普遍难题。')

    add_para(doc, '在此背景下，仅依靠传统的数据共享或单点技术突破，已难以满足全球治理体系对系统性、智能化地理信息服务的迫切需求。UN-GGKIC亟需一个开放、安全、普惠的全球地理信息知识与创新枢纽，以解决广大发展中国家普遍面临的能力短板。与之并行推进的"全球地理信息公共产品研制"项目聚焦于构建完整开放的"数据-知识-服务"产品矩阵，解决"有什么"的基础供给问题；相呼应，本项目则致力于解决"怎么用"和"用得好"的核心瓶颈，旨在为全球海量地理资源与知识产品提供一个枢纽化的服务系统与开放协同的技术生态。')

    add_para(doc, '以谷歌为代表的国际前沿探索已预示着一个由"被动查询"向"主动洞察"转变的地理智能时代正在到来，若不能在此轮技术变革中掌握规则制定权与标准话语权，我们将错失通过技术赋能弥合全球鸿沟、完善全球治理的历史性机遇。本项目的紧迫性与必要性集中体现在以下三个层面：')

    add_para(doc, '其一，在生态构建层面，亟需统一交互协议以破解异构系统互操作难题。全球地理信息服务碎片化的根源在于缺乏跨域协同的通用语言。各类空间数据服务平台、计算引擎与人工智能模型之间彼此孤立，智能体无法自主感知并调用分布式节点上的专业算子，导致多源资源的有效集成与协同调度难以实现。研发突破多源异构资源协同调度、跨域主权数据可信流通等技术难题，从通信协议栈底层定义异构系统间的交互规范与信任契约，已成为构建全球地理信息开放共生生态的基础性前提。')

    add_para(doc, '其二，在能力普惠层面，亟需低门槛的技术开发框架以消除发展中国家的智能鸿沟。面对复杂的空间分析与模型调用流程，广大发展中国家的决策者与技术人员往往因技术门槛而望而却步。现有工具多面向专业用户设计，缺乏对业务逻辑的抽象封装与可视化编排能力，难以在地理信息能力薄弱地区落地应用。因此，研发算力资源弹性调度与低代码智能开发等技术，将复杂算法转化为"开箱即用"的公共产品服务，能够有效地实现技术普惠、提升全球南方国家自主落实SDGs能力。')

    add_para(doc, '其三，在体系集成层面，亟需全链条技术贯通以形成规模化服务能力。目前，我国在地理信息领域的技术输出仍多为"单点突破"，离散化的供给模式导致产品影响力有限，尚未形成覆盖资源接入、智能调度、应用集成等全面的完整技术体系。通过构建全球地理信息智能框架，突破遥感影像智能推荐、时空知识图谱构建与更新等关键技术，研究跨模态地理大模型高效微调与多智能体开发技术，打通从底层模型到顶层决策的全链条技术通路。')

    # ========================================
    # 二、国内外研究现状及技术发展趋势
    # ========================================
    add_heading_styled(doc, '二、国内外研究现状及技术发展趋势', level=1)

    add_heading_styled(doc, '（一）研究现状', level=2)

    add_para(doc, '为深入落实联合国2030年可持续发展议程，全球地理信息服务正从传统的"数据供应"向"智能决策"范式发生根本性跃迁。在这一进程中，大语言模型（LLMs）、多模态遥感基础模型（RSFMs）以及云原生架构的引入为地理空间科学带来了前所未有的机遇。当前研究现状主要体现在以下五个核心维度：')

    add_para(doc, '1. 广域跨域交互协议与主权数据可信流通研究现状', bold=True)
    add_para(doc, '建设全球地理信息知识与创新枢纽的首要障碍在于全球地理空间资源的高度分散。在互操作协议层面，模型上下文协议（Model Context Protocol, MCP）作为一种定义AI应用与外部数据源及工具间双向连接的开放标准，正迅速向地理信息领域演化出专属的规范（Anthropic, 2025）。GeoMCP通过在底层通信栈上利用JSON-RPC 2.0格式，使大语言模型等智能体可以跨越物理边界，自主发现并安全调用分布式节点上的专业GIS算子。在跨域主权数据可信流通层面，学术前沿正转向基于"可用不可见"原则的联邦学习与可信数据空间（Trusted Data Spaces）架构，结合密码学防泄露访问控制（RBAC）与底层协议级互认机制，支撑全球公共地理产品的安全共享。')

    add_para(doc, '2. 地理空间大模型与语义鸿沟破解研究现状', bold=True)
    add_para(doc, '通用大语言模型在地理空间垂直应用中暴露出显著的"语义鸿沟"。当前研究沿三个方向深度展开：一是模型微调与垂直训练，如K2地球科学基础大模型基于LLaMA架构在地学文献与GeoSignal指令集上进行微调（Deng et al., 2024）；二是智能体工具使用与检索增强（Geo-RAG），如MapGPT等Agentic GIS框架允许大模型作为"中枢大脑"通过意图解析自主规划任务并调用外部专业GIS API（Lin et al., 2026）；三是知识图谱增强大模型（KG-Enhanced LLM），如S-GMKG语义驱动的地理建模知识图谱从海量GIS脚本中提取功能单元，为大模型生成复杂空间分析代码提供可解释的图结构路径指导（Hou et al., 2024）。')

    add_para(doc, '3. 多模态遥感基础模型与影像智能推荐的演进', bold=True)
    add_para(doc, '多模态遥感基础模型（MM-RSFMs）成为实现遥感影像智能推荐与自动化解译的关键。SkySense在超过2150万个时序多模态遥感数据集上进行预训练，创新性地提出了多粒度对比学习与地理上下文原型学习机制（Guo et al., 2024）。针对基础大模型在垂直应用中算力消耗过大的问题，参数高效微调（PEFT）技术（如LoRA）被广泛应用于跨模态地理大模型中。')

    add_para(doc, '4. 基于大模型与人机协同的知识图谱构建', bold=True)
    add_para(doc, '地理知识图谱（KG）正全面跨越以固定事实为主的静态阶段，迈向时序知识图谱（TKGs）与事件知识图谱（EKGs），以显式表达地球系统的物理因果链与状态转移规律（Xui et al., 2024）。当前前沿研究致力于构建基于知识图谱与大模型双核驱动、众包协同与专家审核（HITL）结合的持续自主学习知识库系统（Bian, 2025），呈现出"异构数据融合→图谱生成→众包协同验证→持续学习更新"的高度自动化闭环特征。')

    add_para(doc, '5. 云原生算力底座与低代码普惠智能服务现状', bold=True)
    add_para(doc, '云原生地理信息架构与Serverless计算的深度融合正在成为主流（Amiri et al., 2022）。应用利用分布式计算直接对云端海量空间数据（如Cloud-Optimized GeoTIFF）进行就地计算。"计算下推（Pushdown）"正在成为处理海量遥感影像的核心范式——通过将算法直接推送到距离原始卫星数据最近的边缘节点内核中执行，从根本上解决PB级数据跨洲际传输的网络瓶颈。')

    add_heading_styled(doc, '（二）发展趋势', level=2)

    add_para(doc, '面向2025年及未来，全球地理信息智能服务正处于从工具化向生态化、从被动数据分发向主动智能决策演进的关键转折点。核心趋势归结为以下四个维度：')

    add_para(doc, '1. 地理模型上下文协议与数据主权流通的标准化普及。未来的全球地理空间网络将不再是由一个个封闭数据门户组成的孤岛，而是由通用协议串联的全球协同生态。GeoMCP将成为构建地理信息服务枢纽的底层信任契约，通过标准化的大模型通信接口，全球分散的地理资源、算力节点与专业算法将实现"即插即用"式的互联互通。')

    add_para(doc, '2. 从单点提取走向多智能体协同架构。传统的GIS软件操作将全面让位于"AgenticGIS"（代理化GIS）。AI将从单纯的辅助分析工具，蜕变为具备"感知-规划-执行-反思"闭环能力的自主智能体集群（Hinchcliffe & Patience, 2025）。基于图结构（如LangGraph）的多智能体协作将主导地理分析管线。')

    add_para(doc, '3. 时空知识图谱与跨模态大模型的双向赋能。面向高风险的全球灾害响应与SDGs政策推演，地理空间智能将全面转向大模型（LLM）与知识图谱（KG）的"双向赋能"（Xui et al., 2024）。一方面"图谱约束大模型"成为标配，另一方面"大模型反哺图谱"实现知识库的自我繁衍。')

    add_para(doc, '4. 云原生下推与一站式服务聚合。"计算下推（Pushdown）"将成为核心范式，通过将大模型生成的算法直接推送到距离原始卫星数据最近的边缘节点内核中执行。在应用端，平台将演进为"一站式"的能力汇聚中枢。')

    # ========================================
    # 三、拟解决的重大科学与技术问题
    # ========================================
    add_heading_styled(doc, '三、拟解决的重大科学与技术问题', level=1)

    add_para(doc, '本项目拟利用最新的地理空间信息、人工智能技术成果，以互操作协议、可信安全、智能服务为主线，研究全球地理信息智能服务框架，为构建枢纽提供总体架构与核心底座。为实现这一目标，重点攻克以下关键技术问题：')

    add_para(doc, '关键技术一：跨域协议互认与地理模型上下文协议构建技术', bold=True)
    add_para(doc, '（1）通信语义与资产标准化：研发具备空间意识的地理模型上下文协议（GeoMCP V2），扩展空间信息专属的复杂报文规范，通过机器可读的资产元模型（GAAG Contract），统一定义坐标系转换、网络分析等算子的时空边界、输入输出结构与特征向量映射，将多维空间特征进行高精度压缩与语义对齐，为智能体赋予底层的"地理本体意识"，构建标准化的全球地理空间机器通信语言。')
    add_para(doc, '（2）零信任环境下的安全与主权契约：在底层架构上遵循联合国OICT及UNESCO《人工智能伦理问题建议书》所确立的安全性、透明度、自主可控与伦理对齐等核心原则，深度整合跨国数据主权合规、授权令牌认证及细粒度的防泄露访问控制，建立异构数据源与大模型客户端之间的双向可信交互逻辑与加密隔离沙箱。')

    add_para(doc, '关键技术二：面向地理高并发计算的云原生多擎合一与低代码智能体业务流编排技术', bold=True)
    add_para(doc, '（1）多擎合一的微服务云原生架构：深度物理整合时空数据存储引擎、GPU异构AI推理加速引擎与空间算子引擎，建立高性能统一执行沙箱。研发基于AI深度学习的Serverless弹性调度预热机制及毫秒级微服务调度流控算法，通过CAFE计算下推与数据本地化协同处理，将代码执行逻辑主动下推到海量遥感数据所在节点内核执行。')
    add_para(doc, '（2）意图驱动的多模态大模型编排与零代码可视化交互技术：利用海量地球观测时序多模态数据集与专业地理操作代码指令库，对基座大模型实施空间关系对齐训练，攻克多光谱栅格像素到大语言模型高维空间的高精度映射机制，构建事件感知的复合推理与动态纠偏能力；突破意图驱动的零代码多模态编排与交互技术，通过组件化算子抽象与React Flow可视化工作流编排器，使非技术背景用户可通过自然语言驱动复杂地理分析流程。')

    # ========================================
    # 四、项目目标和研究内容
    # ========================================
    add_heading_styled(doc, '四、项目目标和研究内容', level=1)

    add_heading_styled(doc, '（一）项目总体目标', level=2)
    add_para(doc, '本项目拟针对全球地理空间资源分散、异构系统互操作难及发展中国家技术能力弱等问题，解决多源异构资源协同优化的科学问题，突破广域跨域协议互认、算力资源弹性调度与低代码智能开发等关键技术。预期构建一个开放、普惠、安全的全球地理空间智能框架（GeoNexus），并研制地球观测卫星智能服务、全球可持续发展评价、地理信息知识库与远程学习三大应用系统。成果将应用于联合国SDGs监测、全球生态环境评估及教育培训等领域，为全球创新服务提供统一技术底座。通过形成"数据智能-决策支持"全链条能力，有效消除数字鸿沟，显著提升全球特别是发展中国家落实2030议程的能力。')

    add_heading_styled(doc, '（二）具体目标', level=2)

    add_para(doc, '目标一：构建全球地理信息智能框架底座（GeoNexus）。研发GeoMCP V2地理模型上下文协议栈与GAAG地理资产合约注册中心，突破多源异构资源的语义对齐与标准化互操作难题；构建零信任安全网关与跨域合规协作引擎，实现"数据可用不可见"的主权数据可信流通；研发CAFE计算下推与Serverless弹性算力调度引擎，形成Worker就近计算能力；开发意图驱动的低代码智能体编排环境，将复杂空间算法转化为可视化拖拽式工作流。')

    add_para(doc, '目标二：研发地球观测卫星智能服务系统。建立覆盖不少于400颗主流对地观测卫星的互联协议与动态知识库，研发多模态智能匹配引擎实现自然语言到卫星数据参数的任务解析；构建云原生遥感影像智能预处理与轻量化切片工具箱；开发面向灾害应急、农业监测、森林保护等场景的智能体应用卡片，实现从需求触达到决策简报生成的全流程自动化。')

    add_para(doc, '目标三：研发全球可持续发展评价服务系统。研发多源异构数据（社会经济与空间观测）的融合同化与质量评估工具；构建基于灵活指标体系的可视化互操作对标平台；集成系统动力学模型与多目标优化算法，打造"数据融合-指标计算-情景模拟-诊断报告"的完整决策闭环，支撑不少于10项SDG指标的在线监测、差距分析与国别诊断。')

    add_para(doc, '目标四：研发地理信息知识库与远程学习系统。研发基于众包机制的空间知识图谱动态构建与更新技术，构建涵盖"概念-方法-工具-案例-场景"的多维知识图谱；开发智能检索与个性化学习推荐引擎；搭建支持远程实操的虚拟实训沙盒环境；构建集知识整合、在线学习与社群交流于一体的长效运营服务体系，完成不少于15个国家的示范应用。')

    # ========================================
    # 五、项目课题分解方案（重点增强）
    # ========================================
    add_heading_styled(doc, '五、项目课题分解方案', level=1)

    add_heading_styled(doc, '（一）项目课题分解情况', level=2)

    add_para(doc, '本项目《全球地理信息智能框架及服务系统研发》和项目《全球地理信息公共产品研制》同属于专项《全球地理信息公共产品关键技术研发与应用》。本项目侧重于构建开放、安全、普惠的全球地理信息智能框架，并基于该框架研发三大应用系统。项目采用"一基座、三应用"总体架构，系统性地分解为四个高度关联、相互支撑的课题。')

    add_para(doc, '课题1作为整个项目的核心底层基础设施，向下屏蔽了全球异构数据的物理分布与算力差异，向上为课题2、3、4提供了标准化的通信协议（GeoMCP V2）、零信任安全屏障、弹性的计算资源（CAFE Worker引擎）以及低代码的集成交互环境（可视化工作流编排器）。在应用层，课题2负责获取并智能化处理海量地球观测数据，这些地理空间数据与场景化分析结果可以直接输送给课题3，作为其进行社会经济融合、国别诊断与多情景政策推演的客观数据底盘。与此同时，课题4是项目实施"技术普惠"与"能力建设"的关键出口，课题2、3中沉淀的平台操作方法、智能化算子与真实评估案例，将转化为课题4的体系化知识图谱与实训课程。')

    # ---- 课题间接口关系详解 ----
    add_heading_styled(doc, '（二）课题间接口关系详解', level=2)

    add_para(doc, '为确保四个课题间的技术协同与数据贯通，项目定义了12个关键接口（IF-01至IF-12），涵盖能力注册发现、合约管理、任务执行、知识查询、联邦接入、安全审计等全链路交互。各接口的技术规范如下：')

    interfaces = [
        ('IF-01', 'GeoCapability注册', 'GeoMCP /register', '课题1', '框架基座',
         '采用JSON-RPC 2.0 over WebSocket。能力发布方在GeoNode上线时调用，提交capability清单（id/name/type/inputs/outputs/protocols/policies/trustLevel）；注册中心完成格式校验→重复检测→版本管理→广播通知。实现语言：Spring Boot控制平面 + Redis发布订阅。'),
        ('IF-02', 'GeoCapability发现', 'GeoMCP /discover', '框架基座', 'All',
         '支持语义检索（pgvector cosine similarity ≥ 0.85）和结构化过滤（type/provider/region/latencyClass）。返回有序列表，附带trustLevel和latencyClass排序。SDK：Python/Java异步客户端。'),
        ('IF-03', '合约注册', 'POST /api/contracts', 'GAAG', '课题1/2',
         'RESTful API。请求体为GeoAsset Contract JSON-LD，包含contract_id/asset_type/spatial/temporal/bands/semantic_embedding/provenance。完成scan→metadata→LLM描述→embed→register完整流水线。存储：PostGIS（空间）+ pgvector（向量）+ Neo4j（血缘）。'),
        ('IF-04', '合约校验', 'POST /api/contracts/validate', 'GAAG', 'GeoSkill执行',
         'Contract Satisfaction Gating（合约满足度门控）——GeoSkill执行前强制调用。双重验证：（1）语义相似度（pgvector cosine ≥ 0.85）；（2）合约一致性（CRS可转换/bbox重叠IoU≥0.1/波段⊆可用/时间交集非空）。返回：通过/拒绝 + 不满足项详情。'),
        ('IF-05', 'GeoSkill执行', 'GeoMCP /execute', '框架基座', '课题1/3/4',
         '异步GeoJob模式。请求体：skill_id + region + params + contract_id。返回job_id用于轮询。执行流程：Contract Validation → Pushdown Routing → Worker Execution → Result Aggregation。'),
        ('IF-06', 'Workflow编排', 'Temporal Workflow', '框架基座', '课题1/4',
         '基于Temporal.io的生产级工作流引擎。Workflow定义：Python DSL → DAG → Temporal Worker。Activity实现：每个GeoSkill对应一个Temporal Activity，支持Heartbeat、RetryPolicy（最大3次）、Timeout（最长3600s）。'),
        ('IF-07', 'KG查询', 'SPARQL/Cypher', 'GeoKG', '课题3/4',
         '双协议支持。结构化查询：Cypher（Neo4j），用于实体关系遍历、路径推理；语义查询：SPARQL（RDF映射视图），用于跨本体联合查询。统一查询网关：GraphQL → Cypher/SPARQL翻译器。'),
        ('IF-08', '联邦数据接入', 'Adapter Protocol', '多源适配器', '课题1/2/4',
         '适配器接口标准：authenticate() → search(params) → fetch(data_refs) → transform(target_schema)。首批适配器类型：STAC（Sentinel Hub）、Overpass（OSM）、SPARQL（Wikidata）、WMS/WFS（OGC）、EE REST（Google Earth Engine）。'),
        ('IF-09', '策略执行', 'OPA REST', 'GeoFederation', 'All',
         'Open Policy Agent（OPA）作为策略决策点（PDP）。Rego策略规则：空间法律规则本体库形式化编码。执行点：GeoMCP请求拦截器（Envoy Filter）→ OPA查询 → 允许/拒绝/降级。响应时间：P95 < 5ms。'),
        ('IF-10', '审计日志', 'OpenTelemetry', '框架基座', 'All',
         '全链路追踪标准。Trace：GeoMCP请求→合约校验→推下路由→Worker执行→结果聚合完整Span链路。Metrics：请求量/延迟/错误率/合约拒绝率。Logs：结构化JSON日志，包含trace_id/span_id/node_id/user_id。后端：Jaeger + Prometheus + Loki。'),
        ('IF-11', '计算下推', 'Pushdown Protocol', 'CAFE Engine', '课题1/2',
         'Central Server ↔ Worker私有协议。四阶段：（1）pushdown.negotiate（任务协商，含目标Worker/所需数据分片/预估资源消耗）；（2）pushdown.execute（序列化代码+数据引用分发）；（3）data.stream（分块流式回传聚合结果）；（4）event.heartbeat（进度同步）。传输：MessagePack序列化 + gzip压缩。'),
        ('IF-12', '自修复反馈', 'Repair Protocol', 'Code Agent', 'GeoSkill执行',
         'Code Agent自修复循环（≤3次迭代）。流程：执行失败→stack trace捕获→相关Contract注入→LLM生成最小化补丁→Sandbox重新执行→成功→记录修复策略至Episodic Memory；仍失败→降级至人工审核队列。'),
    ]

    # Split into two tables for readability
    iface_headers = ['接口编号', '接口名称', '协议', '提供方', '消费方', '技术规范']

    for batch in [interfaces[:6], interfaces[6:]]:
        add_table_with_header(doc, iface_headers,
            [[i[0], i[1], i[2], i[3], i[4], i[5][:200] + '...'] for i in batch],
            [1.3, 2.2, 2.2, 1.2, 1.2, 7.0])

    doc.add_page_break()

    # ---- 详细课题任务分解 ----
    add_heading_styled(doc, '（三）各课题子任务详细分解', level=2)

    # ====================================
    # 课题1 详细分解
    # ====================================
    add_heading_styled(doc, '课题1：全球地理信息智能框架研发与集成（663.52万元）', level=3)

    add_para(doc, '研究目标：本课题针对当前发展中国家在落实SDGs过程中面临的地理空间资源获取困难、系统平台和技术工具使用门槛高、本土技术能力弱等痛点，遵循开放、安全、普惠的顶层设计原则，致力于研发全球地理信息智能框架（GeoNexus）。重点探究并攻克开放环境下的地理空间数据与异构模型之间交互的标准化互操作协议（GeoMCP V2）、零信任环境下的跨域数据主权协同机制、面向海量并发任务的CAFE计算下推与Serverless弹性算力调度机制，以及意图驱动的低代码智能可视化开发等核心关键技术。', bold=False)

    add_para(doc, '课题1的技术架构深度融合了三种前沿设计哲学：（1）CAFE分布式计算范式（Xu & Bai et al., 2018）——"计算移动至数据端"、Worker就近执行、零原始数据下载；（2）AutoGIS双智能体架构（Chen, Bai & Li et al., 2025）——合约驱动的Data Agent + Code Agent、GAKG知识图谱、自修复循环；（3）GeoMCP V2协议——在Phase 1基础上增强contract_binding、pushdown_spec、federated_sources三类地理专属字段。')

    # ---- 子任务1.1 ----
    add_para(doc, '子任务1.1：地理空间数据和模型交互标准化研究', bold=True)
    add_para(doc, '本子任务面向地理空间模型协同与海量数据按需调用的迫切需求，突破传统封闭式地理信息系统架构与异构数据语义壁垒，构建涵盖数据请求、工具调用、状态同步的地理空间数据和模型交互协议栈规范（GeoMCP V2）。工程实施内容包括：')

    add_para(doc, '（1）协议栈四层原语定义：基于轻量级分布式双工通信架构（JSON-RPC 2.0 over WebSocket），定义GeoMCP V2四层核心原语——握手层（Handshake/Discovery）建立包含客户端算力、网络延迟及用户角色的会话上下文，支持capability.announce（GeoNode上线广播能力清单）、capability.discover（智能体查询匹配GeoCapability）、contract.bind（将GeoAsset Contract与GeoSkill执行上下文绑定），新增contract_binding、federated_sources字段；控制层（Control/Scheduling）定义job.create/job.status/job.cancel异步GeoJob生命周期管理、pushdown.negotiate（Central Server与Worker协商计算下推策略）、schedule.route（基于数据本地性+算力余量+合规策略的智能路由），新增pushdown_spec字段（目标Worker地址/所需数据分片/预估资源消耗）；数据层（Data/Stream）定义data.stream（分块流式传输分析结果，非原始数据）、federated.query（跨联邦节点联合查询）、pushdown.execute（序列化计算代码推送至数据所在Worker），强制约束原始数据不出域；事件层（Event/Audit）定义event.heartbeat（Worker心跳与健康检查）、event.audit（全链路审计日志，符合OpenTelemetry规范）、event.alert（异常事件与安全告警）。')

    add_para(doc, '（2）动态服务发现机制：研发去中心化的空间工具与算子发现机制。每个GeoNode在启动时通过capability.announce向注册中心（Spring Boot Eureka + Redis）广播自身能力清单；智能体通过capability.discover查询匹配的GeoCapability，支持pgvector语义向量检索（模型：text2vec-base-chinese / all-MiniLM-L6-v2）和结构化过滤器（type/provider/region/latencyClass/trustLevel）。服务发现延迟目标：P99 < 100ms。')

    add_para(doc, '（3）空间语义对齐引擎：构建自然语言意图到结构化空间查询的语义映射规则。使用Qwen72B模型进行意图解析，输出结构化JSON：{event_type, spatial_extent{bbox, place_name}, temporal_range{start, end}, sensor_types[], resolution_req, cloud_cover_max}。将海量异构空间数据与复杂地理元数据编码压缩入大语言模型上下文窗口，采用分层摘要策略（metadata summary → spatial context → band details），token预算控制在4096以内。')

    add_para(doc, '（4）跨平台通信套件（SDK）：Java SDK基于Spring WebFlux + Jackson，异步非阻塞；Python SDK基于aiohttp + pydantic，类型安全。两个SDK均实现GeoMCPClient接口：connect(geode_url) → discover(capability_filter) → execute(job_spec) → stream_results(job_id)。SDK包含内置重试（exponential backoff, max 3次）、心跳维持（30s间隔）、自动重连机制。')

    # ---- 子任务1.2 ----
    add_para(doc, '子任务1.2：GAAG地理资产合约注册中心', bold=True)
    add_para(doc, '借鉴AutoGIS论文GAAG架构，研制GeoNexus的地理资产合约注册中心（GeoAsset Contract Registry）。工程实施内容包括：')

    add_para(doc, '（1）自动扫描流水线（scan→metadata→LLM→embed→register）：阶段1-格式归一化：使用GDAL/rasterio统一读取各类栅格格式→内部标准化为Cloud-Optimized GeoTIFF（COG）；阶段2-元数据提取：自动提取CRS（EPSG代码）、bbox（WGS84）、分辨率、波段数/名称/数据类型、时间范围、缺失值比例；阶段3-LLM语义描述生成：调用Qwen72B API，输入元数据JSON→输出自然语言描述（中文+英文）和关键词标签；阶段4-向量嵌入：使用text2vec-base-chinese模型生成768维语义向量→存入pgvector；阶段5-合约注册：拼装完整Contract JSON→写入PostGIS contracts表，同时建立Neo4j数据产品血缘关系。全流程耗时目标：单数据产品 < 30秒。')

    add_para(doc, '（2）Contract Data Model定义：为每种数据类型定义标准化合约模板。核心字段：contract_id（全局唯一标识，格式：contract.{source}.{product}.{tile_id}）、asset_type（枚举：raster/vector/3D/temporal/statistical/text）、spatial（CRS/bbox/resolution）、temporal（start/end/interval）、bands（count/names/wavelengths/dtype）、geometry_type（仅vector）、semantic_embedding（768维float[]）、provenance（source/pipeline/version/license/access_constraint）、quality（cloud_cover_pct/nodata_pct/geometric_rmse）。')

    add_para(doc, '（3）三重存储架构：PostGIS（空间元数据 + bbox R-tree索引 + 属性查询，主表contracts + 分区表contracts_rasters/contracts_vectors）→写入路径为合约注册主路径；pgvector（语义向量 + IVFFlat索引 + cosine similarity检索，表contract_embeddings）→用于语义相似度匹配；Neo4j（数据产品血缘关系图谱，节点类型：Contract/Source/ProcessingPipeline/Organization，关系类型：PRODUCED_BY/DERIVED_FROM/DEPENDS_ON/CONFLICTS_WITH）→用于影响分析和数据溯源。')

    add_para(doc, '（4）Contract Satisfaction Gating（合约满足度门控）：GeoSkill执行前强制通过双重验证——第一关语义相似度：pgvector cosine similarity ≥ 0.85（阈值可配置）；第二关合约一致性验证（四维检查）：空间一致性（CRS可转换为目标CRS + bbox重叠IoU ≥ 0.1）、波段完整性（所需波段 ⊆ 可用波段集合）、时间覆盖（需求时间范围 ∩ 数据时间范围非空）、分辨率适配（数据分辨率 ≤ 需求分辨率 × 2）。实现为Spring Boot拦截器链，失败时返回结构化错误：{passed: false, failures: [{check: "bands", required: ["B4","B8"], available: ["B1","B2","B3"]}]}。')

    # ---- 子任务1.3 ----
    add_para(doc, '子任务1.3：CAFE计算下推与Worker引擎', bold=True)
    add_para(doc, '参考CAFE（Xu & Bai et al., 2018）的"计算移动至数据端"范式，将每个GeoNode重构为"Central Server + N×Worker节点"的分布式架构。工程实施内容包括：')

    add_para(doc, '（1）Central Server架构：基于Spring Boot 3.x构建，核心模块——TaskDispatcher（接收GeoMCP job.create请求→解析GeoAsset Contract确定数据分片位置→任务分解为子任务序列），SmartRouter（多目标优化决策：数据本地性权重0.4 + 算力余量权重0.3 + 合规策略权重0.2 + 网络延迟权重0.1→加权评分选择最优Worker），ResultAggregator（收集Worker返回的聚合统计结果→空间拼接/时序合并→最终产品生成），JobStateMachine（状态：PENDING→CONTRACT_VALIDATION→ROUTING→DISPATCHED→PARTIAL_RESULTS→AGGREGATING→COMPLETED/FAILED/CANCELLED）。')

    add_para(doc, '（2）Worker节点架构：基于FastAPI + Celery，核心模块——DataShardManager（管理本地PostGIS矢量分片 + COG GeoTIFF栅格分片 + Zarr多维数组分片。分片策略：空间四叉树索引，每个分片≤500MB），SandboxExecutor（Docker容器隔离执行下载的计算代码。安全策略：网络=host-only、CPU=2核限制、内存=4GB限制、磁盘=10GB临时卷、超时=3600s、禁止外部网络访问），ResultExporter（计算完成后仅导出聚合统计结果（均值/标准差/分位数/直方图），不导出原始像素或矢量坐标，满足"数据可用不可见"原则），HealthReporter（30s间隔心跳上报：cpu_usage/mem_usage/disk_usage/pending_jobs/active_jobs）。')

    add_para(doc, '（3）Pushdown Protocol实现：基于gRPC双向流（Bidirectional Streaming），MessagePack序列化。四阶段交互——Phase 1 Negotiation：Central→Worker: pushdown.negotiate{job_id, skill_id, data_shard_refs, estimated_cost{cpu_cores, memory_mb, duration_s}}，Worker→Central: {accepted: bool, capacity: {available_cpu, available_mem, queue_depth}}；Phase 2 Execution：Central→Worker: pushdown.execute{code_base64 (WASM or Python pickle), entry_point, params_json, data_shard_refs}；Phase 3 Streaming：Worker→Central: stream<ResultChunk>{chunk_id, data_type, bbox, stats_json, progress_pct}；Phase 4 Completion：Worker→Central: event.heartbeat{status: "completed", output_manifest{artifact_url, checksum, row_count}}。')

    add_para(doc, '（4）Serverless弹性调度：基于Kubernetes HPA + KEDA组合。默认维持最小Worker副本数（2个warm pods），当pending_jobs队列深度 > 10时触发扩容（scale up by ceil(pending_jobs / 5)），最大副本数由节点资源上限决定。AI流量预测：使用LSTM模型（输入：过去7天每小时请求量时间序列 + 星期几特征 + 已知事件日历→输出：未来24小时逐小时预测请求量），提前30分钟预热Worker Pod。冷启动延迟目标：P95 < 500ms（预热命中率 > 90%）。')

    # ---- 子任务1.4 ----
    add_para(doc, '子任务1.4：默认安全体系与跨域合规协作技术研发', bold=True)
    add_para(doc, '面向开放网络环境下地理空间交互中的敏感数据泄露、工具劫持及跨国合规审查等严峻挑战，研发默认原生安全体系与跨域合规协作技术。工程实施内容包括：')

    add_para(doc, '（1）空间法律规则本体库V1.0：系统梳理中国、欧盟（GDPR+INSPIRE）、美国、巴西、印度、南非、肯尼亚、尼日利亚、印度尼西亚、越南等不少于10个国家/地区的测绘与地理信息法规。使用Protégé工具进行OWL本体建模，核心类：Country/Regulation/DataCategory/RestrictionType/CoordinatePrecisionLimit/ExportControl。每个国家的法规知识形式化为多条OPA Rego策略规则。示例规则：deny[msg] { input.data_sensitivity == "high" ; input.bbox within chinese_territory() ; input.requestor_ip not in chinese_ip_ranges() ; msg := "中国高精度地理数据不可向境外IP提供" }。')

    add_para(doc, '（2）自动合规核验引擎：在GeoMCP协议层植入Envoy Filter作为策略执行点（PEP）。每次数据请求经过Filter→提取请求上下文（user_id/role/ip/geo_location/data_sensitivity/bbox/resolution）→组装OPA查询→调用OPA Sidecar（策略决策点PDP）→返回允许/拒绝/降级（降级为低分辨率版本）。响应时间目标：P99 < 5ms（Rego规则预编译+缓存）。拦截器链顺序：IP白名单检查 → 用户认证令牌验证 → 数据敏感度分级 → 空间范围合规 → 分辨率限制 → 水印注入。')

    add_para(doc, '（3）隐私增强计算集成：联邦学习（FL）——基于Flower框架，每个GeoNode作为FL Client持有本地数据，Central Server作为FL Server协调模型训练。仅交换加密梯度（DP-SGD + Secure Aggregation），原始数据永不出域。安全多方计算（SMPC）——多方联合统计场景（如跨国界流域水资源总量），使用SPDZ协议进行安全求和。差分隐私（DP）——所有聚合统计API输出添加校准噪声（ε=1.0, δ=1e-5，使用Google DP Libraries）。')

    add_para(doc, '（4）动态权限与数据水印：即时（JIT）权限分配——用户发起数据请求→系统自动生成短期访问令牌（JWT, TTL=1h）→令牌内嵌访问范围和操作限制→到期自动失效。空间数据水印——栅格水印：基于DWT-DCT频域修改算法，在输出GeoTIFF中嵌入{user_id, timestamp, request_id}水印，PSNR ≥ 40dB（肉眼不可见）；矢量水印：基于坐标微扰算法，在保证拓扑一致性前提下轻微位移顶点（≤0.1×原始精度），嵌入可追溯指纹。')

    # ---- 子任务1.5 ----
    add_para(doc, '子任务1.5：低代码智能开发环境与公共产品共享生态机制研究', bold=True)
    add_para(doc, '面向非技术背景的决策者与领域专家，研发支持自然语言交互与可视化编排的低代码开发环境。工程实施内容包括：')

    add_para(doc, '（1）前端交互平台架构：Vue3 + TypeScript + Pinia状态管理 + Vite构建。核心技术选型——MapLibre GL JS 3.x（高性能矢量瓦片地图渲染，支持MVT/PMTiles格式），React Flow（可视化工作流编辑器，节点=GeoSkill/数据源/参数，边=数据流），deck.gl（大规模地理数据可视化叠加层），CodeMirror 6（JSON/YAML参数编辑器）。组件库：自研GeoNexus UI Kit（基于Tailwind CSS，适配WCAG 2.1 AA无障碍标准）。')

    add_para(doc, '（2）自然语言到工作流的逆向可视化重构：用户输入自然语言描述（如"分析湄公河三角洲2024年洪水对人口的影响"）→LLM意图解析（提取event/location/time/analysis_type）→GeoSkill匹配（pgvector语义检索匹配相关Skill）→Workflow DAG自动生成（拓扑排序，确保数据依赖关系正确）→React Flow可视化渲染（节点自动布局使用dagre算法）→用户可在图形界面中调整参数、替换节点、试运行。')

    add_para(doc, '（3）原子能力组件封装：将空间分析算法封装为标准GeoSkill组件，每个组件暴露统一接口：{id, name, description, inputs_schema (JSON Schema), outputs_schema, params_schema, estimated_cost, version}。首批封装≥12个GeoSkill——工具类3个（缓冲区分析buffer-analysis/叠加统计zonal-statistics/变化检测change-detection），知识类3个（空间查询spatial-query/地图问答map-qa/案例推荐case-recommend），分析类6个（洪水影响flood-impact/作物长势crop-monitoring/森林砍伐deforestation-detection/城市扩张urban-expansion/人口暴露度population-exposure/可达性分析accessibility-analysis）。')

    add_para(doc, '（4）通用预训练智能体矩阵V1.0：封装≥3类基础模型的标准化API（MaaS层）——遥感影像解译模型（SkySense/SkySense++，输入多光谱影像→输出地物分类/变化检测/目标识别），地理文本理解模型（Qwen72B-Geo微调版本，输入自然语言→输出空间查询SQL/GeoJSON），空间查询生成模型（QGIS-GPT 32B，输入自然语言描述→输出PyQGIS/Python分析代码）。API统一采用OpenAI兼容格式（/v1/chat/completions），支持streaming和batch两种模式。')

    add_para(doc, '（5）资产回流评估机制：构建类似HuggingFace的地理空间开源社区。评分模型基于PeerTrust动态信誉算法：Trust_Score = α·Content_Quality（多维质量指标：时空分辨率/位置精度/语义一致性）+ β·Community_Feedback（被引用量/下载量/显式评分）+ γ·Identity_Verification（实名认证状态/机构认证状态）。引入强化学习（Contextual Bandit）持续调整权重α/β/γ，优化推荐排序。产品展示页面按信任分值降序排列，强制优先推荐"实名认证"与"高信誉度"的资产。')

    # ---- 课题1 2026年度子任务表 ----
    add_para(doc, '课题1 2026年度子任务划分与考核指标：', bold=True)

    t1_2026 = [
        ['1', '地理空间数据和模型交互标准化',
         '设计GeoMCP V2协议栈四层原语定义及核心报文格式规范（握手层/控制层/数据层/事件层）；研制跨平台通信套件基础版（Java/Python SDK）；研发实时数据流接入原型（≥3类数据源）；实现局域网与云端节点的算子动态组播注册与检查'],
        ['2', 'GAAG地理资产合约注册中心',
         '设计GeoAsset Contract数据模型V1.0（raster/vector两类合约正式定义）；实现scan→metadata→LLM→embed→register自动流水线；构建PostGIS+pgvector+Neo4j三重存储原型；研发Contract Satisfaction Gating合约校验模块'],
        ['3', 'CAFE计算下推与Worker引擎',
         'GeoNode Central Server + ≥2个Worker节点原型部署（Mekong GeoNode）；Pushdown Protocol智能路由实现（多目标优化）；Serverless弹性调度与AI流量预测预热机制；≥3类空间分析算子下推执行验证'],
        ['4', '默认安全体系与跨域合规协作技术',
         '空间法律规则本体库V1.0（≥10个国家法规形式化）；自动合规核验引擎原型（协议层拦截器+双重核验）；统一单点登录与权限管理基础框架；多方安全计算与联邦学习技术选型与初步集成方案'],
        ['5', '低代码智能开发环境与公共产品共享生态',
         'GeoNexus前端系统V1.0（Vue3+MapLibre+React Flow+deck.gl）；可视化工作流编排器原型（≥5种原子能力拖拽式组装）；通用预训练智能体矩阵V1.0（≥3类基础模型标准化API封装）'],
    ]

    add_table_with_header(doc,
        ['序号', '子任务名称', '2026年度研究内容与考核指标'],
        t1_2026, [1.0, 3.5, 11.0])

    # ---- 双智能体编排引擎 ----
    add_heading_styled(doc, '（四）核心技术引擎：双智能体编排与自修复循环', level=2)

    add_para(doc, 'Data Agent（CAFE思维）：能力包括就近数据发现+合约语义检索+计算下推决策。工作流——接收自然语言需求→GAAG语义搜索（pgvector cosine similarity）→合约满足度验证（Contract Satisfaction Gating四维检查）→确定数据物理位置（查询PostGIS contracts表）→决策计算策略：数据在本地Worker→下推执行；数据在远程节点→评估数据传输成本vs计算迁移成本→选择更优方案。实现：LangGraph StateGraph，节点类型：IntentParser/SemanticSearcher/ContractValidator/LocalityChecker/PushdownDecision。')

    add_para(doc, 'Code Agent（AutoGIS思维）：能力包括合约感知代码合成+沙箱安全执行+自修复循环。工作流——接收合约绑定上下文（包含数据Contract引用、目标分析类型、参数）→检索相似GeoSkill模板（Episodic Memory）→LLM合成PyQGIS/Python分析代码（注入Contract中的CRS/bbox/bands信息）→Docker Sandbox执行→成功→输出结果+记录模板至Memory；失败→捕获stack trace→注入相关Contracts→生成最小化补丁→重新执行（≤3次迭代）→成功→记录修复策略至Episodic Memory；仍失败→降级至人工审核队列（Webhook通知+Slack告警）。模型：QGIS-GPT 32B（基于Qwen3-32B，采用三阶段阶梯式对齐训练：持续预训练+监督微调+RLHF）。')

    add_para(doc, '共享多层记忆架构：Working Memory（Redis，当前任务上下文，TTL=任务生命周期）——{task_id, params, intermediate_results, execution_state}；Episodic Memory（PostgreSQL，历史任务经验，持久化）——{task_type, contract_pattern, code_template, repair_strategy, success_flag}；Semantic Memory（pgvector，领域知识嵌入，768维向量）——{geo_asset_contracts, sdg_indicator_ontology, spatial_operator_semantics}；Procedural Memory（Neo4j，操作流程模式DAG）——{geo_workflow_templates, common_error_fix_patterns, dependency_graph}。')

    add_para(doc, '自修复循环：Code Agent生成代码 → Sandbox执行 → 成功 ⇒ 输出结果；失败 ⇒ 捕获stack trace → 错误类型分类（语法错误/类型错误/CRS不匹配/波段缺失/内存溢出/超时）→ 注入相关Contracts到LLM上下文 → 生成最小化修复补丁（只修改错误行±5行上下文）→ 重新执行（迭代计数+1）→ 若迭代>3 → 降级至人工审核。自修复成功率目标：Q3 2026 ≥ 70%，Q4 2026 ≥ 85%，2027全年 ≥ 92%。')

    doc.add_page_break()

    # ====================================
    # 课题2 详细分解
    # ====================================
    add_heading_styled(doc, '课题2：地球观测卫星智能服务系统研发（642.97万元）', level=3)

    add_para(doc, '研究目标：本课题旨在研发地球观测卫星智能服务系统，通过建立全球对地观测资源互联协议与动态更新的卫星资源知识库，实现对分散卫星资源的统一索引与管理；研发多模态智能匹配引擎，突破自然语言任务到卫星数据参数的映射难题；构建遥感数据智能处理与检校工具箱；开发场景化智能体，针对灾害应急、农业监测、森林保护等典型领域，实现从需求触发、资源调度、数据处理到信息生成的全程自动化。最终形成覆盖全球主要卫星资源的信息接入能力、智能解读能力与快速响应能力，将数据获取与处理周期从天级缩短至小时级。')

    # ---- 子任务2.1 ----
    add_para(doc, '子任务2.1：卫星资源互联与知识库构建', bold=True)
    add_para(doc, '工程实施内容：（1）统一元数据模型——基于STAC 1.1标准扩展，定义卫星属性字段：platform（平台名称/机构/国家）、instrument（传感器类型/波段/分辨率/幅宽）、orbit（轨道类型/周期/降交点时间）、access（开放策略/API端点/认证方式/速率限制）、quality（辐射精度/几何精度/时效性）。每颗卫星记录为GeoJSON Feature，properties包含上述所有字段。存储：Elasticsearch（实时全文搜索+聚合分析）+ PostGIS（空间范围查询+STAC兼容接口）。')

    add_para(doc, '（2）元数据同步机制——实现与ESA Copernicus Data Space（STAC API）、NASA CMR（REST API）、USGS EarthExplorer（OGC CSW）、中国资源卫星应用中心（自定义适配器）的定时同步。定时任务：Apache Airflow DAG，每小时增量同步（delta update），每天全量校验（reconciliation）。')

    add_para(doc, '（3）多模态智能匹配引擎——核心算法流程：用户输入NL→Qwen72B任务解析（提取event_type/spatial_extent/temporal_range/sensor_preference/resolution_req/cloud_cover_max）→结构化查询JSON→Elasticsearch多字段加权搜索（空间距离×0.3 + 时间覆盖×0.25 + 分辨率匹配×0.2 + 云量条件×0.15 + 用户评价×0.1）→候选TOP-5→多目标优化排序（数据完整性×时空覆盖×用户评价×获取便捷性）→最优数据源组合推荐+可解释性理由。响应时间目标：P95 < 3秒。')

    add_para(doc, '（4）可视化检索面板——前端MapLibre GL渲染卫星数据覆盖轮廓（footprint GeoJSON），支持时间段滑块/云量滑块/BBox矩形绘制三种过滤方式联动。后端：Elasticsearch geo_shape查询 + PostGIS ST_Intersects查询双通道，自动选择最优索引。')

    # ---- 子任务2.2 ----
    add_para(doc, '子任务2.2：遥感数据智能处理与检校', bold=True)
    add_para(doc, '工程实施内容：（1）模块化预处理工具箱——部署于Kubernetes集群，每个处理模块为独立Pod。辐射定标模块：支持Sentinel-2 Level-1C→Level-2A（使用Sen2Cor算法）、Landsat 8/9 Level-1→Level-2（使用LaSRC算法）、高分系列（使用中国资源卫星应用中心辐射校正参数库）。大气校正模块：6S辐射传输模型+Py6S Python包装器，自动查找气溶胶光学厚度（AOD）和水汽含量参数。几何精校正模块：基于参考影像（Sentinel-2全球参考影像集）的自动同名点匹配（SIFT/RootSIFT）+多项式校正（1次/2次/3次可配置）。云与阴影检测模块：改进版FMask 4.0算法（Python实现）+ Sentinel-2 Scene Classification Layer集成。影像融合与镶嵌模块：多时相合成（中值合成/最大NDVI合成）、多传感器融合（HCS算法）。')

    add_para(doc, '（2）COG金字塔切片服务——处理流水线：预处理后GeoTIFF→gdal_translate -of COG（自动生成overviews+添加HTTP Range读取支持）→上传至MinIO/S3兼容存储→注册至STAC Catalog→生成TileJSON端点。瓦片服务：titiler-mosaic（支持动态mosaic多个COG场景），Web Mercator栅格瓦片（/tiles/{z}/{x}/{y}.png），支持colormap/stretch/rescale等渲染参数。')

    add_para(doc, '（3）多级别产品输出——Level-1：原始快视图（RGB真彩色+假彩色合成JPEG/PNG）；Level-2：标准植被指数（NDVI/EVI/SAVI/NDWI）、变化检测产品（两时相差值图）；Level-3：专题分类产品（地物分类/洪水范围/火烧迹地），支持COG/GeoJSON/CSV多格式输出。')

    # ---- 子任务2.3 ----
    add_para(doc, '子任务2.3：场景化智能体与开放服务', bold=True)
    add_para(doc, '工程实施内容：（1）领域模型知识库——面向5大典型应用领域构建结构化知识库。每个领域包含：标准分析流程（Workflow DAG）、遥感数据需求模板（传感器/波段/分辨率/时间频率）、历史案例库（≥50个结构化案例）、常见误判模式与质量控制规则。领域：洪水监测（Flood Monitoring）、作物长势分析（Crop Health）、森林砍伐预警（Deforestation Alert）、城市扩张监测（Urban Expansion）、灾害损失评估（Disaster Assessment）。')

    add_para(doc, '（2）场景应用智能体——每个场景封装为智能体应用卡片。卡片定义：{id, name, icon, description, required_inputs: {region: GeoJSON, time_range: [start, end]}, output_cards: [flood_map, affected_population, crop_loss, report], processing_steps: [satellite_retrieval, water_segmentation, overlay_analysis, zonal_stats, report_generation], estimated_duration: "5-15 min"}。用户只需在地图上划定AOI，智能体自动完成意图理解→数据需求生成→最优资源调度（调用子任务2.1）→智能处理调用（调用子任务2.2）→专题图与决策简报生成的全流程自动化。')

    add_para(doc, '（3）标准化API与微服务封装——将资源发现、智能匹配、预处理、智能体分析等核心能力封装为RESTful API + GeoMCP Skill双重接口，支持发展中国家国土、农业、林业、应急管理等部门的业务系统嵌入调用。API采用OpenAPI 3.0规范，提供Python/JavaScript/R三语言SDK，附带Jupyter Notebook教程。')

    add_para(doc, '课题2 2026年度子任务划分与考核指标：', bold=True)

    t2_2026 = [
        ['1', '卫星资源互联与知识库构建', '汇聚跨机构卫星元数据，建成覆盖≥100颗主流对地观测卫星的元数据索引仓库（Elasticsearch/PostGIS）；研发可视化检索面板，支持按时间段/云量/BBox精准过滤；建立与国际组织的元数据同步机制'],
        ['2', '遥感数据智能处理与检校', '研发云端遥感影像智能预处理工具箱V1.0（辐射定标/大气校正/几何精校正/云检测/影像融合）；开发COG金字塔切片服务；建立国产高分系列辐射校正参数库'],
        ['3', '场景化智能体与开放服务', '开展灾害场景响应数据挂载测试；完成≥1个场景化应用智能体完整链路验证；封装核心能力为标准化API'],
    ]

    add_table_with_header(doc,
        ['序号', '子任务名称', '2026年度研究内容与考核指标'],
        t2_2026, [1.0, 3.5, 11.0])

    doc.add_page_break()

    # ====================================
    # 课题3 详细分解
    # ====================================
    add_heading_styled(doc, '课题3：全球可持续发展评价服务系统研发（657.43万元）', level=3)

    add_para(doc, '研究目标：本课题旨在针对发展中国家的国情，构建本土化适配的可持续发展指标评估分析工具与动态仪表盘技术。通过三个逻辑递进、功能互补的子任务，系统构建覆盖"数据基础-分析工具-决策支持"全链条的SDG智能评估与决策支持体系。')

    # ---- 子任务3.1 ----
    add_para(doc, '子任务3.1：SDG多源数据融合与质量评估工具箱研发', bold=True)
    add_para(doc, '工程实施内容：（1）统计与空间数据融合引擎——双路径融合策略。路径一（统计降尺度）：输入省级统计数据+高分辨率遥感协变量（夜间灯光NPP-VIIRS/土地利用ESA WorldCover/人口密度WorldPop/路网OSM/地形SRTM）→分层随机森林模型（scikit-learn RandomForestRegressor, n_estimators=500, 5-fold CV）→输出公里级格网化估计值→残差分配（地理加权回归GWR修正空间自相关）。路径二（直接推断）：输入高分辨率遥感特征→XGBoost模型（xgb.XGBRegressor, 树深=8, 学习率=0.05, 早停=50轮）→直接预测格网级指标值。两个路径结果融合：贝叶斯模型平均（BMA）加权。')

    add_para(doc, '（2）数据质量评估体系——基于FAIR原则（Findable/Accessible/Interoperable/Reusable）四维评估。每个网格单元输出：{value, confidence_interval: [lower, upper], quality_level: "A"/"B"/"C", uncertainty_sources: ["输入统计误差", "空间降尺度误差", "时间外推误差"]}。空间不确定性量化：蒙特卡洛模拟（1000次迭代）→每个网格的经验分布→2.5%/97.5%分位数作为置信区间。')

    add_para(doc, '（3）安全合规集成——调用课题1的零信任网关OPA策略引擎，每次数据请求前检查：用户所在国家对目标数据的访问权限、数据分辨率上限是否符合出口管制、聚合统计最小单元数（k-anonymity ≥ 10以确保个人隐私）。前端数据调取流程强制植入主权协议确认弹窗+数据水印展示。')

    # ---- 子任务3.2 ----
    add_para(doc, '子任务3.2：可视化评估与互操作平台', bold=True)
    add_para(doc, '工程实施内容：（1）SDG工作流构建器——基于课题1的React Flow可视化工作流编排器，封装SDG专用分析模块：数据预处理（空间裁剪/重投影/重采样/缺失值填充）、指标计算（SDG 1.1.1贫困人口比例/SDG 2.4.1可持续农业面积/SDG 6.6.1水资源变化/SDG 11.3.1土地利用效率/SDG 13.1.1自然灾害影响人口/SDG 15.1.1森林覆盖率等≥10项核心指标）、空间分析（热点分析Getis-Ord Gi*/空间自相关Moran\'s I/时空趋势Mann-Kendall）、可视化输出（地图/图表/表格三视图联动）。用户通过拖拽组合模块→配置参数→试运行→输出Dashboard。')

    add_para(doc, '（2）Vector Tiles高性能渲染引擎——后端：PMTiles格式存储（单文件，支持HTTP Range请求，无需服务端）。使用tippecanoe将GeoJSON矢量数据生成PMTiles（最大zoom 14，要素简化容差可配置）。前端：MapLibre GL JS加载PMTiles + 动态样式表达式（data-driven styling）。性能目标：千万级多边形加载 < 2秒（Web Worker解析+IndexedDB缓存）。')

    add_para(doc, '（3）SDG动态仪表盘——图表库：D3.js（自定义动画过渡）+ ECharts（快速原型）+ Observable Plot（科学可视化）。仪表盘组件：时间序列折线图（多指标/多国家对比，支持brush缩放）、指标对比雷达图（雷达轴=SDG指标，填充=不同国家/年份）、空间热力图（MapLibre热力图图层，支持时间轮播）、国别差距分析图（目标值vs当前值，带趋势预测虚线）、桑基图（SDG指标间权衡/协同关系流图）。')

    add_para(doc, '（4）国别对标引擎——支持多国同指标横向对比（排名/距平/百分位）和历史趋势纵向分析（Mann-Kendall趋势检验+Sen\'s slope）。基于知识图谱的相似国情推荐：在GeoKG中查找地理条件/经济水平/人口规模相似的国家→推荐其成功案例和最佳实践。')

    # ---- 子任务3.3 ----
    add_para(doc, '子任务3.3：模拟推演与决策支持', bold=True)
    add_para(doc, '工程实施内容：（1）SDG情景模拟引擎——核心模型：系统动力学（System Dynamics）建模。子系统划分——人口子系统（出生率/死亡率/迁移率）、经济子系统（GDP/产业结构/投资率）、资源子系统（水资源/土地资源/能源）、环境子系统（碳排放/森林覆盖/生物多样性）。建模工具：Stella Architect（原型）+ Python PySD（生产部署，读取Vensim/XMILE模型文件+NumPy/SciPy求解微分方程）。')

    add_para(doc, '（2）多目标优化耦合——算法：NSGA-III（非支配排序遗传算法III，基于DEAP库实现）。优化目标：最大化SDG综合得分、最小化政策干预成本、最小化区域不平等。决策变量：≥8个政策变量（财政投入比例/税率/补贴率/保护面积比例/技术投资比例等）。输出：Pareto前沿（非支配解集）+ 每个Pareto解的SDG指标演进曲线。')

    add_para(doc, '（3）"推演一张图"仪表板——交互式界面：左侧政策变量滑块面板（8个滑块+预设情景按钮：BAU基线/绿色转型/高速增长/均衡发展），中央SDG指标雷达图+趋势线（多情景对比，不同颜色），右侧空间地图（格网级SDG指标预测值热力图，支持时间轴播放）。政策建议自动生成：LLM根据推演结果生成结构化简报（差距分析→趋势研判→政策建议→风险提示）。')

    add_para(doc, '课题3 2026年度子任务划分与考核指标：', bold=True)

    t3_2026 = [
        ['1', 'SDG多源数据融合与质量评估工具', '构建多源数据融合展示底图；完成"统计-空间"关联模型原型设计与验证；配合课题1安全网关完成主权协议确认弹窗+数据水印展示逻辑'],
        ['2', '可视化评估与互操作平台', '开发Vector Tiles高性能瓦片渲染引擎；研发SDG动态仪表盘V1.0（≥10个核心指标可视化）；开发SDG评估可视化工作流构建器原型'],
        ['3', '模拟推演与决策支持', '完成人口-经济-SDG关联核心子系统因果反馈网络构建与数学表达；实现系统动力学+多目标优化初步耦合；完成"推演一张图"概念原型设计'],
    ]

    add_table_with_header(doc,
        ['序号', '子任务名称', '2026年度研究内容与考核指标'],
        t3_2026, [1.0, 3.5, 11.0])

    doc.add_page_break()

    # ====================================
    # 课题4 详细分解
    # ====================================
    add_heading_styled(doc, '课题4：地理信息知识库与远程学习系统研发（766.08万元）', level=3)

    add_para(doc, '研究目标：本课题面向联合国机构与发展中国家在地理信息能力建设中的现实需求，围绕"知识如何转化为能力"这一核心问题，聚焦知识结构建模、能力生成路径构建与远程情景化实践转化机制等关键方向，致力于研发一个集知识聚合、智能学习、长效运营于一体的地理信息知识库与远程学习系统。')

    # ---- 子任务4.1 ----
    add_para(doc, '子任务4.1：地理信息知识库与知识图谱体系化构建', bold=True)
    add_para(doc, '工程实施内容：（1）知识体系化重构——建立统一的知识分类框架与表达标准，形成"核心概念-方法工具-案例场景-政策标准"的四层知识结构体系。知识来源：UN-IGIF框架文档、OGC/ISO/TC 211标准体系、全球典型案例（SDG评估/灾害管理/国土规划）、学术论文与教材。')

    add_para(doc, '（2）GeoKG四层本体模型——实体层（Entity Layer）：Country/SDG_Indicator/GeoDataProduct/GeoSkill/Policy/Case/Organization/Expert/Event等核心实体类型。属性层（Attribute Layer）：每个实体的属性字段定义（如Country.population/SDG_Indicator.target_value/GeoDataProduct.spatial_resolution）。关系层（Relation Layer）：supports（政策→指标支撑）、governs（法规→区域管辖）、depends_on（指标→数据产品依赖）、benchmarks_against（国别→国别对标）、produces（组织→数据产品产出）、cites（案例→政策引用）。规则层（Rule Layer）：IF-THEN推理规则——IF deforestation_rate > threshold AND precipitation_change < 0 THEN food_security_risk = HIGH（基于SWRL规则语言编码）。')

    add_para(doc, '（3）LLM知识抽取流水线——技术栈：文档解析（PyMuPDF/Unstructured/Python-docx多格式统一解析）→文本分块（LangChain RecursiveCharacterTextSplitter, chunk_size=1000, overlap=200）→实体抽取（spaCy NER + GLiNER开放域实体识别双模型，实体类型映射至GeoKG本体）→关系抽取（REBEL关系抽取模型微调版，输出spo三元组）→实体对齐（基于BERT sentence embedding的余弦相似度匹配+Levenshtein编辑距离，阈值0.85）→图谱注入（Neo4j Cypher批量写入，使用UNWIND优化批量导入）→规则抽取（基于大模型的规则挖掘：识别"如果...则..."模式→SWRL规则候选→专家审核→正式发布）。')

    add_para(doc, '（4）智能检索与问答——混合检索策略：BM25关键词检索（Elasticsearch）+ 向量语义检索（pgvector）+ 图遍历（Neo4j Cypher）。检索结果融合：Reciprocal Rank Fusion（RRF）算法统一排序。自然语言问答：基于RAG架构——用户问题→向量检索召回相关KG子图→子图+问题作为LLM Context→Qwen72B生成答案+引用路径（实体ID和来源文档）。')

    # ---- 子任务4.2 ----
    add_para(doc, '子任务4.2：情景化智能学习模块设计研发', bold=True)
    add_para(doc, '工程实施内容：（1）三级课程体系——L1基础认知（面向政府决策者/NGO管理者，内容：地理信息基本概念/SDGs监测框架/平台使用入门，形式：短视频+图文+Quiz），L2专业方法（面向技术人员/分析师，内容：遥感影像处理/空间分析方法/SDG指标计算/QGIS实操，形式：视频教程+Jupyter Notebook+在线练习），L3综合应用（面向高级分析师/项目管理者，内容：SDG综合评估/情景模拟推演/政策分析报告撰写，形式：案例研讨+虚拟实训+证书考核）。')

    add_para(doc, '（2）个性化学习路径推荐——基于知识图谱的学习路径动态匹配。算法：用户初始能力评估（自适应测验，IRT项目反应理论）→用户能力向量（K维，K=知识点数量）→目标能力向量→知识图谱中K个节点的最短路径（Dijkstra变体，边权重=学习时长）→推荐课程序列。学习进度跟踪：基于知识追踪模型（DKT/BKT），实时更新用户在每个知识点的掌握概率，当掌握概率 > 0.8 时标记为已掌握。')

    add_para(doc, '（3）虚拟实训沙盒环境——基于Docker容器化技术。每个用户启动独立实训容器：{QGIS Desktop (LinuxServer.io镜像) + JupyterLab (geopandas/rasterio/xarray/scikit-learn预装) + 预置练习数据（全球开源地理数据包）+ 任务描述（Markdown笔记本）}。容器生命周期：用户发起实训→系统分配空闲容器（预热池）→WebSocket连接noVNC远程桌面+Jupyter→操作日志记录→任务完成/超时→容器快照保存→销毁。并发容量：单节点支持≥20个同时实训会话。')

    # ---- 子任务4.3 ----
    add_para(doc, '子任务4.3：知识众包与长效运营模式研究', bold=True)
    add_para(doc, '工程实施内容：（1）知识众包提交与审核——标准化案例提交流程：提交者填写结构化模板（标题/摘要/国家/领域/SDG指标/数据来源/方法/结果/经验教训）→自动格式校验+重复检测（TF-IDF cosine similarity）→社区投票（≥3个高信誉用户赞同）→专家审核（领域专家评分≥3/5）→正式发布→定期回顾（每12个月触发重新审核）。贡献激励：积分系统+徽章体系+季度贡献排行榜+高级权限解锁。')

    add_para(doc, '（2）"感知-识别-众包-质检"更新框架——Sentinel变化检测（自动发现地表覆盖变化热点）→微任务自动生成（Tile-based分割，每个微任务≤1km²范围，类型：变化确认/地物分类/边界修正）→移动端App（React Native，离线地图+GPS定位+照片上传）众包验证→多人交叉验证（Fleiss\' Kappa ≥ 0.6 表示一致性良好）→自动更新（Kappa ≥ 0.8直接更新）或专家复核（Kappa < 0.6提交专家）。')

    add_para(doc, '（3）长效运营模式——服务分层：基础服务免费（知识检索/基础课程/社区参与），增值服务支持（机构定制培训方案/高级认证考试/专属数据分析支持/私有化部署咨询）。运营指标：月活跃用户MAU/课程完成率/知识贡献量/案例下载量/用户满意度NPS/MTR（Member to Reviewer转化率，激励用户从消费者转变为审核者/贡献者）。')

    add_para(doc, '课题4 2026年度子任务划分与考核指标：', bold=True)

    t4_2026 = [
        ['1', '地理信息知识库与知识图谱体系化构建', '研发知识图谱可视化漫游组件（力导向图）；完成GeoKG四层本体模型设计，初始图谱构建（≥2万实体入库）；开发LLM知识抽取流水线原型（文档解析→实体抽取→关系抽取）；集成IGIF国家行动计划案例原型'],
        ['2', '情景化智能学习模块设计研发', '开发在线学习门户V1.0（课程目录/案例集市/公告资讯）；构建三级课程结构（基础-专业-综合）；初步研究学习行为数据采集与分析机制；完成虚拟实训沙盒环境技术选型与原型搭建'],
        ['3', '知识众包与长效运营模式研究', '建立案例共建与内容录入机制（提交-审核-发布-修订闭环）；研究知识众包激励方式与贡献记录；建立平台运行与公测反馈机制；构建平台运行数据监测体系'],
    ]

    add_table_with_header(doc,
        ['序号', '子任务名称', '2026年度研究内容与考核指标'],
        t4_2026, [1.0, 3.5, 11.0])

    doc.add_page_break()

    # ========================================
    # 六、研究方法及技术路线（重点增强——工程可实施级别）
    # ========================================
    add_heading_styled(doc, '六、研究方法及技术路线', level=1)

    add_heading_styled(doc, '（一）总体技术路线', level=2)
    add_para(doc, '本项目按照"需求牵引、体系设计、技术突破、平台研发、集成示范"的逻辑展开。总体技术路线遵循"标准先行、技术攻关、系统研制、集成应用、能力建设"的方针：课题1首先从顶层设计入手，研发GeoMCP V2协议与GAAG合约注册中心，构建开放、安全、普惠的GeoNexus智能框架底座；课题2基于该框架建立全球卫星资源互联协议与智能处理工具箱；课题3依托课题1框架与课题2数据支撑，构建SDG全链条决策支持体系；课题4集成前序课题产出，构建知识图谱与远程学习系统。')

    add_para(doc, '项目总体架构采用"四横三纵"技术体系：横向分为基础设施层（Kubernetes集群/PostGIS/pgvector/Neo4j/MinIO/Redis）、协议与框架层（GeoMCP V2/GAAG/CAFE/零信任网关）、智能引擎层（Data Agent/Code Agent/LLM推理/知识抽取）、应用服务层（卫星服务/SDG评价/知识学习）；纵向贯穿安全合规（零信任/联邦学习/数据水印）、标准规范（GeoMCP/GeoAsset Contract/OpenTelemetry）、运维保障（监控告警/CI-CD/灾备恢复）三条能力线。')

    # ---- 详细技术路线：课题1 ----
    add_heading_styled(doc, '（二）课题1核心技术路线：GeoNexus智能框架', level=2)

    add_para(doc, '【GeoMCP V2协议栈工程实现路线】', bold=True)
    add_para(doc, 'Phase 1 — 基础通信（2026 Q1-Q2）：基于JSON-RPC 2.0 over WebSocket实现双向双工通信。服务端：Spring Boot 3.x + Netty WebSocket Server。客户端SDK：Java（Spring WebFlux WebSocketClient）、Python（aiohttp WebSocket）。消息格式：{"jsonrpc": "2.0", "method": "capability.announce", "params": {...}, "id": "uuid-v4"}。Phase 2 — 协议增强（2026 Q2-Q3）：在Phase 1 GeoMCP基础上增强三类地理专属字段——contract_binding（绑定GeoAsset Contract ID到执行上下文）、pushdown_spec（指定计算下推目标Worker/数据分片/资源预估）、federated_sources（声明跨联邦数据源的接入适配器类型和端点）。Phase 3 — 流式传输与事件（2026 Q3-Q4）：实现data.stream分块流式传输（Chunked Transfer Encoding + gzip，每块≤1MB，带checksum验证）；event.heartbeat（Worker 30s心跳，Central Server超时3次=90s判定失联）；event.audit（OpenTelemetry Traces + Spans全链路追踪，Jaeger可视化）。Phase 4 — 生产加固（2027 Q1-Q2）：TLS 1.3双向认证、速率限制（Token Bucket算法）、断路器（Resilience4j CircuitBreaker）、消息持久化（Kafka日志).')

    add_para(doc, '【GAAG合约注册中心工程实现路线】', bold=True)
    add_para(doc, 'Phase 1 — 数据模型与存储（2026 Q1-Q2）：PostgreSQL 16 + PostGIS 3.4 + pgvector 0.6。建表DDL——contracts表（id UUID PK/contract_id TEXT UNIQUE/asset_type ENUM/spatial_bbox GEOMETRY(Polygon, 4326)/spatial_crs INTEGER/temporal_start TIMESTAMPTZ/temporal_end TIMESTAMPTZ/resolution NUMERIC/bands JSONB/semantic_embedding vector(768)/provenance JSONB/created_at TIMESTAMPTZ/updated_at TIMESTAMPTZ）。索引：GIST(spatial_bbox)、IVFFlat(semantic_embedding vector_cosine_ops，lists=1000)、BTREE(asset_type, created_at)。Phase 2 — 自动扫描流水线（2026 Q2-Q3）：Apache Airflow DAG编排——Step1: S3/MinIO bucket监听新文件事件（MinIO Webhook→Airflow Sensor）→Step2: GDAL rasterio元数据提取Python脚本→Step3: 调用Qwen72B API生成语义描述和关键词→Step4: text2vec-base-chinese生成768维向量→Step5: 组装Contract JSON→写入PostGIS+pgvector→Step6: Neo4j创建血缘节点和关系。Phase 3 — 合约门控（2026 Q3-Q4）：Spring Boot Interceptor实现——preHandle()检查语义相似度→检查空间一致性→检查波段完整性→检查时间覆盖；全部通过→放行；任一失败→返回结构化错误JSON。门控结果记录至pg_audit表用于后续分析优化。')

    add_para(doc, '【CAFE计算下推引擎工程实现路线】', bold=True)
    add_para(doc, 'Phase 1 — 单节点原型（2026 Q1-Q2）：每个GeoNode为单体FastAPI服务（Phase 1现状），逐步演进。Phase 2 — Central+Worker拆分（2026 Q2-Q3）：Central Server（Spring Boot 3.x, 端口8080）职责——接收job.create→Contract查询→路由决策→任务分发；Worker节点（FastAPI, 端口8100）职责——数据分片管理→沙箱执行→结果回传。通信：gRPC（protobuf定义PushdownProtocol，四阶段service定义）。Phase 3 — 计算下推（2026 Q3-Q4）：实现不少于3类空间分析算子的下推执行——缓冲区分析（PostGIS ST_Buffer + GEOS C++库本地调用）、叠加统计（rasterstats/python, 栅格+矢量叠加，zonal statistics）、网络分析（pgRouting + OSM路网数据）。Phase 4 — 弹性调度（2026 Q4-2027 Q2）：Kubernetes HPA（基于CPU/Memory + 自定义Metrics pending_jobs_depth）→KEDA ScaledObject（min=2, max=20, pollingInterval=15s）→预热机制（LSTM预测→提前scaleUp→warm pod启动QGIS环境约30s→就绪探针检测TCP端口）。')

    add_para(doc, '【双智能体编排工程实现路线】', bold=True)
    add_para(doc, 'Data Agent实现（Python, LangGraph）：StateGraph定义→节点：IntentParseNode（调用Qwen72B解析NL→结构化意图JSON）→ContractSearchNode（pgvector相似度搜索→候选Contract列表）→ContractValidateNode（Contract Satisfaction Gating四维检查→过滤有效Contract）→LocalityCheckNode（查询Central Server数据位置→决策本地vs远程）→PushdownDecisionNode（输出：最优Worker地址 + 数据分片引用列表）。Code Agent实现：StateGraph定义→节点：ContextAssemblyNode（组装合约上下文+历史相似任务+GeoSkill模板）→CodeGenNode（调用QGIS-GPT 32B生成Python代码）→SandboxExecNode（Docker SDK for Python创建容器→挂载只读数据卷→执行代码→捕获stdout/stderr）→ErrorAnalyzeNode（解析stack trace→分类错误类型→检索修复模板）→RepairNode（注入Contract+错误信息→LLM生成补丁→迭代重试，max 3次）。')

    add_para(doc, '【零信任安全网关工程实现路线】', bold=True)
    add_para(doc, '技术选型：Envoy Proxy（南北向流量网关，请求拦截）+ Open Policy Agent（策略决策，Rego规则评估）+ Keycloak（身份与访问管理，OIDC/OAuth 2.0）+ Vault（密钥管理，短期令牌签发）。部署拓扑：Envoy Sidecar注入每个Service Pod→拦截所有入站请求→提取JWT令牌+请求参数→调用OPA Sidecar→OPA评估Rego策略→返回允许/拒绝/降级→Envoy执行决策。Rego策略示例包（中国法规）：禁止境外IP请求中国境内高精度（优于10m）地理数据；所有输出地图必须包含标准审图号水印；军事设施周边10km缓冲区数据禁止任何外部访问。')

    add_heading_styled(doc, '（三）课题2核心技术路线：卫星智能服务', level=2)

    add_para(doc, '【多模态智能匹配引擎】', bold=True)
    add_para(doc, '算法流水线——Step1意图解析：用户输入自然语言→Qwen72B（prompt模板："你是一个遥感卫星数据推荐专家。分析用户需求并提取：1.地理范围 2.时间范围 3.传感器偏好 4.空间分辨率要求 5.云量限制。"）→结构化JSON输出→参数校验与标准化（地名→bbox坐标转换使用OSM Nominatim API，时间表达式→ISO 8601日期）。Step2候选检索：Elasticsearch multi_match查询（fields: [satellite_name^3, sensor_type^2, description]，fuzziness: AUTO）+ geo_shape过滤（bbox within satellite_footprint）+ range过滤（temporal_coverage/time_range）。Step3多目标排序：加权评分=0.3×空间覆盖完整性+0.25×时间覆盖匹配度+0.2×分辨率适配度+0.15×云量条件满足度+0.1×用户历史满意度。Step4推荐输出：TOP-3最优数据源组合+每个推荐的解释文本（由LLM生成）+快速预览链接（STAC Browser URL）。')

    add_para(doc, '【遥感预处理工具箱技术栈】', bold=True)
    add_para(doc, '编程语言：Python 3.11+，核心库：rasterio 1.3（栅格I/O）、GDAL 3.8（格式转换和投影）、scikit-image 0.22（图像处理）、OpenCV 4.9（特征匹配）。深度学习框架：PyTorch 2.2 + ONNX Runtime（模型推理优化）。容器化：Docker + Kubernetes Deployment。模块清单——辐射定标模块：高分系列参数来自中国资源卫星应用中心发布的年度辐射校正系数表（XML格式）；Sentinel-2使用ESA官方Sen2Cor算法（Docker容器调用）；Landsat使用USGS LaSRC算法。大气校正模块：6S辐射传输模型（Fortran源码+Py6S Python包装器），气溶胶光学厚度（AOD）自动查找策略：优先使用MODIS/MAIAC AOD产品（1km分辨率），其次使用ECMWF CAMS全球再分析数据，最后使用气候学平均值。云检测模块：FMask 4.0 Python实现，输入TOA反射率+角度信息→输出云/云影/晴空/雪冰四类掩膜；Sentinel-2额外使用ESA Scene Classification Layer（60m分辨率概率图）。')

    add_heading_styled(doc, '（四）课题3核心技术路线：SDGs评价', level=2)

    add_para(doc, '【统计降尺度模型工程实现】', bold=True)
    add_para(doc, '数据预处理管线（Python, pandas + GeoPandas）——Step1: 省级统计数据清洗（缺失值检测→MICE多重插补→异常值IQR检测）→Step2: 遥感协变量提取（在省级边界内对每个格网协变量计算均值/标准差/中位数/总和等聚合统计）→Step3: 特征工程（生成交互特征：人口密度×夜间灯光/不透水层比例×路网密度等）→Step4: 模型训练（分层随机森林，scikit-learn Pipeline: StandardScaler→RandomForestRegressor(n_estimators=500, max_depth=15, min_samples_leaf=10, oob_score=True)）→Step5: 预测与残差分配（对每个公里格网预测→计算省级残差=真值-预测和→使用地理加权回归将残差空间分配到格网）→Step6: 后处理（人口加权调整确保格网总和=省级总统计值）。')

    add_para(doc, '【系统动力学模拟推演引擎】', bold=True)
    add_para(doc, 'Python实现——模型定义：使用PySD读取Vensim/XMILE格式的SD模型文件（支持图形化建模工具Stella Architect导出）。核心方程类型：存量方程（Stock: S(t+1)=S(t)+Inflow(t)-Outflow(t)）、流量方程（Flow: f(S, params, time)）、辅助变量（Auxiliary: a=f(stocks, params)）。求解器：scipy.integrate.odeint（LSODA算法，自动切换刚性/非刚性问题）。时间步长：Δt=0.25年（季度），模拟周期：2026-2050。多目标优化集成：DEAP库实现NSGA-III，种群大小=100，代数=500，交叉概率=0.9，变异概率=0.1。每代评估：运行SD模拟→计算3个目标函数值（SDG得分/政策成本/基尼系数）→非支配排序→生成下一代。输出：Pareto前沿可视化（3D散点图+2D投影）+最优折中解的SDG指标演进曲线。')

    add_heading_styled(doc, '（五）课题4核心技术路线：知识库与学习系统', level=2)

    add_para(doc, '【LLM知识抽取流水线技术细节】', bold=True)
    add_para(doc, '完整技术栈：文档解析层（PyMuPDF for PDF/Unstructured for HTML+PPTX/Spire.Doc for DOCX→统一输出为结构化Markdown）→文本处理层（LangChain RecursiveCharacterTextSplitter, chunk_size=1000 tokens, overlap=200 tokens, 按段落边界分割）→实体抽取层（spaCy en_core_web_trf模型进行NER→提取GPE/ORG/PERSON/DATE/GPE等→GLiNER开放域实体识别补充→实体类型映射：GPE→Country/City，ORG→Organization，DATE→TemporalExpression）→关系抽取层（微调版REBEL模型：输入text chunk→输出[{"head": "EntityA", "type": "depends_on", "tail": "EntityB"}]三元组列表）→实体对齐层（sentence-transformers/all-MiniLM-L6-v2编码实体名称+上下文→FAISS索引→余弦相似度≥0.85判定为同一实体→跨文档合并）→图谱注入层（Neo4j Cypher: UNWIND $triples AS triple MERGE (h:Entity {name: triple.head}) MERGE (t:Entity {name: triple.tail}) MERGE (h)-[r:RELATION {type: triple.type}]->(t)）。性能目标：单文档处理 < 10秒，批量处理100文档 < 5分钟。')

    add_para(doc, '【个性化学习推荐算法】', bold=True)
    add_para(doc, '混合推荐策略——协同过滤（Collaborative Filtering）：基于用户-课程交互矩阵（隐式反馈：浏览/收藏/完成/评分），使用矩阵分解（SVD, latent_dim=50）生成用户嵌入向量和课程嵌入向量→相似用户学过的课程作为推荐候选。知识图谱推荐（KG-based）：在GeoKG中构建"用户-知识图谱"路径——用户已掌握知识点→知识图谱中的先修关系依赖→推荐下一个应学习的知识点对应的课程。内容推荐（Content-based）：课程文本TF-IDF向量+用户兴趣TF-IDF向量余弦相似度。三路推荐结果融合：加权混合（协同0.4+知识图谱0.4+内容0.2）→去重→个性化排序（结合用户能力等级、学习进度、历史偏好）→输出TOP-10推荐课程列表。冷启动策略：新用户通过初始能力测试（15题自适应测验）→确定能力等级→推荐该等级最热课程。')

    doc.add_page_break()

    # ========================================
    # 七、预期成果与考核指标
    # ========================================
    add_heading_styled(doc, '七、预期成果与考核指标', level=1)

    add_heading_styled(doc, '（一）项目考核技术指标', level=2)

    indicators = [
        ['协议标准', 'GeoMCP V2协议栈规范', '正式发布，包含discovery/execution/pushdown/federation四层原语'],
        ['协议标准', 'GeoAsset Contract数据模型', '覆盖≥6种数据类型（raster/vector/3D/temporal/statistical/text）'],
        ['平台系统', 'GeoNexus智能框架平台', '上线运行，支持≥100个GeoNode节点注册与发现'],
        ['平台系统', '三大应用系统', '全部上线运行'],
        ['卫星资源', '卫星数据集成与访问能力', '≥400颗卫星元数据统一索引'],
        ['SDG指标', 'SDG在线监测与分析', '≥10项指标，含差距分析与诊断报告自动生成'],
        ['知识图谱', 'GeoKG知识图谱', '≥100万实体，覆盖SDGs/IGIF/国土空间规划三大领域'],
        ['示范应用', '国家示范应用', '≥15个国家'],
        ['协议接入', '联邦数据适配器', '≥5类（Sentinel Hub/OSM/WorldKG/Wikidata/GEE）'],
        ['GeoSkill', '可注册GeoSkill', '≥12个（3工具+3知识+6分析）'],
        ['安全合规', '零信任安全网关', '覆盖≥10个国家测绘法规的合规引擎'],
        ['性能指标', '遥感影像智能推荐响应', '≤3秒（从自然语言到数据源组合推荐）'],
        ['性能指标', 'SDG指标在线计算延迟', '≤30秒（单指标、单国家）'],
        ['性能指标', '自修复成功率', '≥92%（Code Agent自修复循环≤3次迭代）'],
    ]

    add_table_with_header(doc,
        ['指标类别', '考核指标', '完成时状态'],
        indicators, [2.0, 5.0, 8.5])

    add_heading_styled(doc, '（二）2026年度任务考核技术指标', level=2)

    y2026_indicators = [
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

    add_table_with_header(doc,
        ['指标类别', '考核指标', '完成时状态'],
        y2026_indicators, [2.0, 5.0, 8.5])

    # ========================================
    # 八、主要创新点
    # ========================================
    add_heading_styled(doc, '八、主要创新点', level=1)

    innovations = [
        ('创新点一：GeoMCP V2——首个面向地理空间智能体交互的标准化协议栈。',
         '在通用MCP协议基础上，首次定义了空间物理基准（CRS/bbox/geometry）的原生协议语义，增强contract_binding、pushdown_spec、federated_sources三类地理专属字段，实现跨域地理资源的"即插即用"式互联互通。融合零信任架构与空间法律规则本体库，实现毫秒级的跨国合规自动核验。'),
        ('创新点二：CAFE计算下推与"零数据下载"联邦协同机制。',
         '首次将CAFE的"计算移动至数据端"范式工程化实现于全球地理信息服务平台，通过Central Server + Worker就近计算模式与Pushdown Protocol智能路由，从根本上解决PB级遥感数据的跨洲际传输瓶颈。结合联邦学习与安全多方计算，实现"数据可用不可见"的跨域协同分析。'),
        ('创新点三：合约驱动的双智能体编排与自修复循环。',
         '融合AutoGIS的合约驱动理念，构建Data Agent（合约感知数据发现+下推决策）+ Code Agent（合约感知代码合成+自修复≤3次迭代）的双智能体协同架构。通过Contract Satisfaction Gating确保数据-算法的一致性，通过共享多层记忆实现智能体的持续进化。'),
        ('创新点四：GAAG地理资产合约注册中心。',
         '每个数据产品同步生成包含CRS/bbox/bands/temporal/resolution的机器可读Data Contract，实现从"人工找数据"到"合约自动匹配"的范式转变。自动扫描流水线使新增数据产品可被即时发现与调用。'),
        ('创新点五：从"一国一图"到"一国一策"的L1/L2/L3三级服务模式。',
         '首次提出基于GeoNode联邦部署的三级差异化服务模式（L1自主维护/L2协同维护/L3援助维护），适配不同国家/地区的基础设施与技术能力水平，实现从"统一供给"到"按需适配"的服务范式创新。'),
    ]

    for title, body in innovations:
        add_para(doc, title, bold=True)
        add_para(doc, body)

    # ========================================
    # 九、预期经济社会效益
    # ========================================
    add_heading_styled(doc, '九、预期经济社会效益', level=1)

    add_para(doc, '社会效益：直接支撑UN-GGKIC的核心业务能力建设，为全球南方国家提供高质量、易获取的地理信息智能服务；有效弥合数字鸿沟，助力发展中国家提升自主落实2030年可持续发展议程的能力；推动中国地理信息技术与标准走向全球合作舞台，提升在国际地理信息领域的话语权；为构建人类命运共同体提供精准、高效、普惠的空间信息支撑。')

    add_para(doc, '经济效益：通过"基础服务免费+增值服务支持"的运营模式，形成可持续的平台经济生态；降低发展中国家获取和使用地理信息技术的成本，释放数字经济潜力；促进我国地理信息产业的国际化发展，带动相关技术出口与服务输出；为全球地理信息公共产品市场培育标准化、规模化的技术生态。')

    doc.add_page_break()

    # ========================================
    # 十、实施计划（重点增强）
    # ========================================
    add_heading_styled(doc, '十、实施计划', level=1)

    add_heading_styled(doc, '（一）项目总体实施框架', level=2)

    add_para(doc, '本项目按照"需求牵引、体系设计、技术突破、平台研发、集成示范"的逻辑展开，三年分三个阶段推进：')

    add_para(doc, '2026年（基础构建期）：Phase 1原型 → Phase 2 Alpha。完成GeoMCP V2协议草案、GAAG合约注册中心v0.5、CAFE Worker引擎原型、Data Agent + Code Agent原型、GeoNexus前端V1.0、卫星元数据索引库（≥100颗）、首批数据产品（≥3类）、GeoKG知识图谱（≥2万实体）、首个目标国GeoNode部署（南非）。')

    add_para(doc, '2027年（深化完善期）：Alpha → Beta。QGIS-GPT 32B适配GeoNexus并投产；≥20类SDGs指标上线运行；GeoKG知识图谱扩展至≥50万实体；Code Agent自修复成功率稳定≥92%；≥5个GeoWorkflow实现生产级运行；零信任安全网关全面就绪并覆盖≥10个国家法规的合规引擎；联邦数据适配器≥5类全部完成并稳定运行。')

    add_para(doc, '2028年（集成收尾期）：Beta → 业务化运行。全球≥400颗卫星完成元数据统一索引集成；GeoKG知识图谱突破≥100万实体；UN-GGKIC平台正式承载全球业务；≥15个国家示范应用全面完成并交付；长效运营体系确立，"基础服务免费+增值服务支持"模式投入运行；完成项目总结验收，形成可推广、可复制的全球地理信息智能服务技术体系与运营模式。')

    # ---- 2026年度详细季度计划 ----
    add_heading_styled(doc, '（二）2026年度季度实施计划', level=2)

    add_para(doc, '【Q1（1-3月）：协议夯实与原型评估】', bold=True)

    q1_plan = [
        ['1月', '项目启动与技术调研',
         '课题1：启动GeoMCP V2协议栈需求调研；完成Phase 1代码库全面评审输出技术债务清单；完成Vue3/MapLibre/React Flow/deck.gl前端技术选型与原型验证；启动GeoAsset Contract数据模型设计。课题2：完成Sentinel Hub/Landsat/高分系列等公开卫星数据源API接入调研报告；完成卫星元数据统一描述模型设计；完成遥感预处理工具技术选型。课题3：完成SDGs知识体系框架设计初稿；启动GeoKG四层本体设计。课题4：完成非洲10国基础数据调研报告；完成GeoNode部署拓扑初步设计。'],
        ['2月', '方案设计与技术验证',
         '课题1：完成GeoMCP V2协议栈握手层与控制层原语定义草案；完成GeoAsset Contract raster/vector两类数据模型正式定义V1.0；启动Java/Python SDK基础框架搭建。课题2：完成卫星元数据索引存储方案设计（Elasticsearch+PostGIS）；完成可视化检索面板UI原型。课题3：完成GeoKG四层本体模型详细设计；完成SDGs指标选取方案（≥10个核心指标）。课题4：完成UN-GGKIC对接计划初稿；完成非洲10国GeoNode部署优先级排序。'],
        ['3月', '季度里程碑验证',
         '课题1：完成GeoMCP V2四层协议栈规范V0.5；完成跨平台通信套件基础版可运行原型（Java/Python SDK）。课题2：完成卫星元数据索引库初始搭建与可视化检索面板原型。课题3：完成SDGs知识体系框架正式版与图数据库Schema设计。课题4：完成非洲10国调研报告终稿与部署拓扑方案。Q1验收：四大课题完成技术方案设计，提交实施方案分册。'],
    ]

    add_table_with_header(doc,
        ['月份', '主题', '重点任务描述'],
        q1_plan, [1.5, 3.5, 10.5])

    add_para(doc, '【Q2（4-6月）：CAFE引擎与合约注册中心】', bold=True)

    q2_plan = [
        ['4月', '核心引擎启动',
         '课题1：启动GeoNode Central Server架构重构；完成Pushdown Protocol通信协议设计；启动GAAG自动扫描器开发（scan→metadata模块）；完成PostGIS+pgvector双重存储Schema与环境搭建。课题2：批量采集Sentinel-1/2、Landsat 8/9、高分系列等卫星元数据入库；完成多维过滤功能开发；启动星历数据库建设。课题3：启动SDGs监测评估知识体系建模；完成Neo4j图数据库环境搭建与初始本体导入。课题4：完成首个目标国（南非）GeoNode部署环境调研与准备。'],
        ['5月', '引擎集成与联调',
         '课题1：完成GeoNode Central Server V1.0核心功能（任务分发/智能路由/结果聚合）；完成≥2个Worker节点部署与注册；实现Pushdown Protocol基础通信链路；完成GAAG自动扫描器LLM描述生成模块集成（Qwen72B API）。课题2：卫星元数据索引库（≥50颗卫星，≥5000景影像元数据）；实现pgvector语义检索初步集成。课题3：完成首批知识建模成果导入Neo4j；启动规则推理引擎原型开发。课题4：完成南非GeoNode边缘节点硬件环境准备与网络部署。'],
        ['6月', '季度里程碑验证',
         '课题1：Central Server + ≥2个Worker节点Mekong GeoNode原型部署与端到端联调完成；Pushdown Protocol智能路由完成；GAAG自动扫描完整流水线完成（scan→metadata→LLM→embed→register）；Contract Satisfaction Gating合约校验模块完成。课题2：卫星元数据索引库覆盖≥100颗主流卫星；可视化检索面板上线；国际组织元数据同步机制对接完成。课题3：SDGs监测评估知识体系正式版完成；规则推理引擎原型可运行。课题4：南非GeoNode边缘节点部署与初步连通性测试完成。Q2验收：CAFE Worker引擎原型可运行，GAAG合约注册中心v0.5上线。'],
    ]

    add_table_with_header(doc,
        ['月份', '主题', '重点任务描述'],
        q2_plan, [1.5, 3.5, 10.5])

    add_para(doc, '【Q3（7-9月）：多源联邦与智能体原型】', bold=True)

    q3_plan = [
        ['7月', '联邦适配器开发',
         '课题1：启动Sentinel Hub联邦数据适配器开发（STAC API标准）；启动OSM联邦数据适配器开发（Overpass API）；启动Spring Boot控制平面搭建v0.1；完成Data Agent需求分析与架构设计。课题2：启动遥感影像智能预处理工具箱开发（辐射定标/大气校正模块）；完成场景化智能体框架架构设计。课题3：启动LLM知识抽取流水线开发；完成GeoKG首批知识实体批量入库（≥1万）。课题4：完成非洲5国数据整合方案设计。'],
        ['8月', '智能体原型开发',
         '课题1：完成Sentinel Hub适配器开发与连通性测试；完成OSM适配器开发与连通性测试；Data Agent原型开发（就近数据发现+合约语义检索+计算下推决策）。课题2：完成预处理工具箱辐射定标/大气校正/云检测三大模块开发；完成灾害场景领域模型知识库初始构建（≥50个历史案例）。课题3：LLM知识抽取流水线原型可运行（文档解析→实体抽取→关系抽取）；GeoKG ≥2万实体入库。课题4：启动肯尼亚Edge GeoNode部署准备。'],
        ['9月', '季度里程碑验证',
         '课题1：Sentinel Hub/OSM首批联邦数据适配器通过连通性测试；Data Agent原型完成端到端验证（接收NL需求→GAAG语义搜索→合约满足度验证→数据位置决策）。课题2：遥感智能预处理工具箱原型发布；场景化智能体框架搭建完成，完成洪水监测初步链路验证。课题3：GeoKG ≥2万实体入库；LLM知识抽取流水线可运行。课题4：完成第二Edge GeoNode（肯尼亚）部署。Q3验收：联邦适配器就绪，Data Agent原型验证通过，GeoKG ≥2万实体。'],
    ]

    add_table_with_header(doc,
        ['月份', '主题', '重点任务描述'],
        q3_plan, [1.5, 3.5, 10.5])

    add_para(doc, '【Q4（10-12月）：智能体集成与年度收尾】', bold=True)

    q4_plan = [
        ['10月', 'Code Agent开发',
         '课题1：启动Code Agent开发（合约感知代码合成）；完成沙箱执行环境搭建（Docker Sandbox + WASM）；完成自修复循环框架（错误捕获→stack trace分析→合约注入→补丁生成→重新执行）。课题2：完成灾害场景应用智能体完整链路开发；启动数据推荐链路压力测试与性能优化。课题3：三大知识产品（SDGs/IGIF/国土空间规划）内容构建与审核；SDG仪表盘V1.0 UI/UX优化。课题4：启动"一国一图"非洲10国首版数据库整合构建。'],
        ['11月', '系统集成与测试',
         '课题1：Code Agent原型完成（合约感知代码合成+沙箱执行+自修复循环≤3次）；双智能体共享多层记忆初步集成；完成WorldKG/Wikidata/GEE三类适配器补充开发；≥12个GeoSkill完成封装注册。课题2：灾害场景应用智能体端到端链路验证完成；数据推荐链路秒级检索达标（≤3秒）。课题3：三大知识产品构建完成；SDG仪表盘V1.0正式上线；模拟推演引擎原型验证完成。课题4：完成"一国一图"非洲10国首版数据库构建。'],
        ['12月', '年度收尾与验收',
         '课题1：GeoNexus智能框架V1.0集成测试完成；完成《GeoMCP V2协议规范》草案编制。课题2：全球遥感卫星智能服务系统V1.0版开发完成并上线运行。课题3：全球可持续发展评价与服务系统V1.0版上线运行。课题4：全球地理信息知识与远程学习服务系统V1.0版上线运行；完成与UN-GGKIC联合评测。综合：完成2026年度项目总结报告、成果集成、年度评审与验收；编制2027年度实施计划。'],
    ]

    add_table_with_header(doc,
        ['月份', '主题', '重点任务描述'],
        q4_plan, [1.5, 3.5, 10.5])

    # ---- Phase 1 → Phase 2 代码迁移路径 ----
    add_heading_styled(doc, '（三）Phase 1 → Phase 2 代码迁移路径', level=2)

    migration = [
        ['server.js（Node.js，单进程，SQLite）', 'server.js（API网关）+ Spring Boot（控制平面）', '渐进式替换：先以Spring Boot构建新控制平面，server.js降级为纯API网关'],
        ['app.js（原生JS SPA）', 'Vue3 + MapLibre + React Flow + deck.gl', '全新开发：Vite + TypeScript + Pinia技术栈，组件化重构'],
        ['data/registry.json（静态种子JSON）', 'GAAG Contract Registry（PostGIS + pgvector + Neo4j）', '数据迁移：JSON→PostGIS批量导入，新增pgvector语义向量字段'],
        ['GeoNode Runtime（单进程FastAPI）', 'GeoNode V2（CAFE模式：Central + N×Worker）', '架构演进：FastAPI服务拆分为Central Server + Worker两个独立服务'],
        ['Temporal（scaffolded）', 'Temporal（生产级≥5种GeoWorkflow）', '功能增强：从脚手架到完整Workflow定义+Activity实现+Heartbeat'],
        ['模拟jobTimers（setInterval）', 'Temporal Activity + Heartbeat（真实长时任务）', '替换：移除setInterval模拟，实现真实Temporal Activity'],
        ['1个GeoSkill + 2个registry-only', '≥12个GeoSkill（3工具+3知识+6分析）', '增量注册：按季度逐步开发并注册新的GeoSkill'],
        ['1个Node.js依赖文件', 'package.json + requirements.txt + pom.xml（三语言）', '规范化：建立三语言依赖管理体系'],
        ['无前端构建工具', 'Vite + TypeScript + Pinia', '工程化：引入现代前端工程化工具链'],
    ]

    add_table_with_header(doc,
        ['Phase 1（当前）', 'Phase 2（2026 Q4目标）', '迁移策略'],
        migration, [4.5, 5.5, 5.5])

    # ---- 风险分析 ----
    add_heading_styled(doc, '（四）风险分析与应对措施', level=2)

    risks = [
        ['技术风险', '大模型语义鸿沟难以有效弥合', '高', '中', '建立GeoCode-Eval评测基准；采用Geo-RAG+KG增强双路径策略；引入人工审核节点兜底'],
        ['技术风险', 'CAFE计算下推跨洲际网络延迟过高', '中', '中', '增量结果返回+流式传输；超大规模计算实施分片并行+异步聚合'],
        ['技术风险', '自修复循环成功率不达预期（<80%）', '中', '中', '建立常见错误模式库与修复策略模板；渐进式目标（Q3≥70%，Q4≥85%，2027≥92%）'],
        ['数据风险', '卫星数据源API访问受限或接口变更', '中', '高', '建立多源冗余机制（每种数据类型≥2个备选）；定时监测API可用性并自动切换'],
        ['合规风险', '目标国数据安全法规重大变化', '高', '低', '空间法律规则本体库支持热更新；建立法规变更监测与预警机制'],
        ['管理风险', '四个课题间接口协调不畅', '高', '中', '建立月度课题联调机制；依托接口规划表（IF-01~IF-12）设置集成里程碑'],
        ['人力风险', '关键技术人员流失', '中', '低', '建立核心技术文档强制归档制度；实施双人备份（每项关键技术≥2名掌握人员）'],
        ['部署风险', '非洲目标国网络基础设施薄弱', '中', '高', '设计L1/L2/L3三级服务模式弹性适配；L3模式支持纯云托管+轻量边缘节点'],
    ]

    add_table_with_header(doc,
        ['风险类别', '风险描述', '影响程度', '发生概率', '应对措施'],
        risks, [2.0, 4.5, 1.5, 1.5, 6.0])

    # ---- 质量保证 ----
    add_heading_styled(doc, '（五）质量保证措施', level=2)

    add_para(doc, '（1）代码质量管理：采用Git进行版本控制，实施分支管理策略（main/develop/feature/*）；所有代码提交须通过代码评审（Code Review），≥1名同行评审通过方可合并；单元测试覆盖率≥70%（核心模块≥85%）；使用SonarQube进行静态代码分析。')

    add_para(doc, '（2）协议与接口质量管理：GeoMCP V2协议栈须通过跨平台兼容性测试（Java/Python/JavaScript SDK互操作验证）；所有课题间接口（IF-01~IF-12）须在联调测试中验证通过；API响应时间、并发吞吐量等性能指标须在季度验收中达标。')

    add_para(doc, '（3）数据产品质量管理：卫星元数据索引库须通过完整性校验（≥95%字段填充率）；数据产品须附带质量等级标签与置信区间；知识图谱实体须通过人工抽检（准确率≥90%）。')

    add_para(doc, '（4）系统测试管理：每季度末进行系统集成测试（SIT）；每半年进行用户验收测试（UAT）；关键应用场景（灾害应急、SDG评估）须通过端到端场景测试。')

    add_para(doc, '（5）文档管理：所有技术方案、接口规范须形成正式文档并纳入版本管理；建立项目知识库（Wiki），记录设计决策、技术调研、问题解决过程；每季度提交进展报告，每年度提交总结报告。')

    # ---- 项目管理 ----
    add_heading_styled(doc, '（六）项目管理机制', level=2)

    add_para(doc, '（1）组织架构：项目负责人（彭舒、杨木）全面负责项目组织实施与重大决策；课题负责人（杨木、吕子川、何兴华、邵克俭）各课题技术路线制定与任务执行；项目管理办公室（PMO）负责进度跟踪、经费管理、文档归档、外部协调。')

    add_para(doc, '（2）会议制度：每周课题内部站会（进度同步、问题沟通）；每月课题间联调会议（接口联调、集成测试）；每季度项目全体技术评审会（成果演示、里程碑验收、下季度计划确认）；每半年专家咨询会（邀请外部专家技术指导与成果评估）。')

    add_para(doc, '（3）沟通机制：建立项目Slack/Teams频道确保实时沟通；重大技术决策须通过RFC（Request for Comments）流程；跨课题接口变更须提前通知并更新接口规划表。')

    add_para(doc, '（4）经费管理：严格按照课题预算执行，定期进行经费使用情况审查；设备采购、外委协作等重大支出须经过审批流程；每季度提交经费执行报告。')

    # ========================================
    # 保存
    # ========================================
    output_path = 'docs/全球地理信息智能框架及服务系统研发（main）-enhanced.docx'
    doc.save(output_path)
    print(f'Enhanced document saved to: {output_path}')
    print(f'Done!')

if __name__ == '__main__':
    build_enhanced_document()
