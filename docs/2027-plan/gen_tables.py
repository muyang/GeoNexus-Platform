"""生成课题1的5张表格（参照课题3格式）。

运行方式：
    /tmp/docxenv/bin/python gen_tables.py
输出：
    ../2027年度课题1任务表.docx
"""

from pathlib import Path
from docx import Document
from docx.shared import Inches, Pt, Cm, RGBColor, Emu
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml.ns import qn, nsdecls
from docx.oxml import parse_xml
import copy

BASE = Path(__file__).resolve().parent
OUT = BASE.parent / "2027年度课题1任务表.docx"

FONT = "Hiragino Sans GB"
HEADER_BG = "D5E8F0"  # 表头浅蓝底
BORDER_COLOR = "333333"


# ── 辅助函数 ──

def _set_cjk(run, font=FONT, size=Pt(9), bold=False, color=None):
    """设置中文字体+字号+粗体。"""
    run.font.name = font
    run.font.size = size
    run.font.bold = bold
    if color:
        run.font.color.rgb = color
    rPr = run._r.get_or_add_rPr()
    ea = rPr.find(qn('a:ea'))
    if ea is None:
        from lxml import etree
        ea = etree.SubElement(rPr, qn('a:ea'))
    ea.set('typeface', font)


def _add_run(cell, text, font=FONT, size=Pt(9), bold=False, color=None, align=WD_ALIGN_PARAGRAPH.LEFT):
    """向单元格添加带格式的文本段落。"""
    p = cell.paragraphs[0]
    p.alignment = align
    p.paragraph_format.space_before = Pt(1)
    p.paragraph_format.space_after = Pt(1)
    run = p.add_run(text)
    _set_cjk(run, font, size, bold, color)


def _add_cell(cell, text, font_size=Pt(9), bold=False, align=WD_ALIGN_PARAGRAPH.LEFT):
    """填充单元格文本。"""
    cell.text = ""
    _add_run(cell, text, size=font_size, bold=bold, align=align)


def _set_cell_borders(cell, top=True, bottom=True, left=True, right=True):
    """设置单元格边框。"""
    tc = cell._tc
    tcPr = tc.get_or_add_tcPr()
    borders = parse_xml(
        f'<w:tcBorders {nsdecls("w")}>'
        + ('<w:top w:val="single" w:sz="4" w:color="' + BORDER_COLOR + '"/>' if top else '')
        + ('<w:bottom w:val="single" w:sz="4" w:color="' + BORDER_COLOR + '"/>' if bottom else '')
        + ('<w:left w:val="single" w:sz="4" w:color="' + BORDER_COLOR + '"/>' if left else '')
        + ('<w:right w:val="single" w:sz="4" w:color="' + BORDER_COLOR + '"/>' if right else '')
        + '</w:tcBorders>'
    )
    tcPr.append(borders)


def _set_table_borders(table):
    """为表格所有单元格添加边框。"""
    for row in table.rows:
        for cell in row.cells:
            _set_cell_borders(cell)


def _set_header_row(table, texts, col_widths=None):
    """设置表头行（浅蓝背景+粗体白色文字）。"""
    row = table.rows[0]
    for i, text in enumerate(texts):
        cell = row.cells[i]
        cell.text = ""
        cell._tc.get_or_add_tcPr()
        shading = parse_xml(f'<w:shd {nsdecls("w")} w:fill="{HEADER_BG}" w:val="clear"/>')
        cell._tc.get_or_add_tcPr().append(shading)
        _add_cell(cell, text, font_size=Pt(9.5), bold=True, align=WD_ALIGN_PARAGRAPH.CENTER)
        if col_widths and i < len(col_widths):
            cell.width = col_widths[i]


def _doc():
    """创建新文档。"""
    doc = Document()
    for section in doc.sections:
        section.top_margin = Cm(2.0)
        section.bottom_margin = Cm(1.8)
        section.left_margin = Cm(2.2)
        section.right_margin = Cm(2.2)
    return doc


def _add_table(doc, title, headers, rows_data, col_widths, merge_cells=None):
    """添加一个表格（标题 + 表头 + 数据行）。"""
    # 标题
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.space_before = Pt(12)
    p.paragraph_format.space_after = Pt(6)
    run = p.add_run(title)
    _set_cjk(run, FONT, Pt(11), bold=True, color=RGBColor(0x1F, 0x29, 0x37))

    ncols = len(headers)
    nrows = len(rows_data)
    table = doc.add_table(rows=nrows + 1, cols=ncols)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = True

    _set_header_row(table, headers, col_widths)

    for r, row_data in enumerate(rows_data):
        row = table.rows[r + 1]
        for c, cell_text in enumerate(row_data):
            _add_cell(row.cells[c], str(cell_text), font_size=Pt(8.5))

    _set_table_borders(table)

    # 合并单元格
    if merge_cells:
        for (r1, c1, r2, c2) in merge_cells:
            table.cell(r1, c1).merge(table.cell(r2, c2))

    return table


# ═══════════════════════════════════════════════════════════
# 表1：2027年度子任务
# ═══════════════════════════════════════════════════════════
def table_subtasks(doc):
    title = "表1  全球地理信息智能框架研发与集成课题（课题1）2027年度子任务"
    headers = ["序号", "子任务名称", "研究内容"]
    col_w = [Cm(1.2), Cm(4.5), Cm(10.5)]
    rows = [
        ["1",
         "编制《地理空间模型上下文协议\n（GeoMCP）V2.0》技术文档",
         "基于Phase 1 GeoMCP V1.0实现基础，采用协议工程方法，定义四层原语"
         "（握手层/控制层/数据层/事件层）精确语义、报文格式与状态转换逻辑；在"
         "V1.0基础上新增contract_binding（资产合约绑定）、pushdown_spec"
         "（计算下推规格）与federated_sources（联邦数据源声明）三个关键字段"
         "及其JSON Schema约束；编制协议一致性测试向量（≥13个），完成"
         "Java/Python双端SDK契约对齐验证，确保V1.0降级兼容。"],
        ["2",
         "研发全球地理信息智能框架\n系统V2.0",
         "采用系统工程与组件化方法，将GAAG合约注册中心升级为PostGIS+"
         "pgvector+Neo4j三重存储架构，支持语义检索与血缘图谱查询；扩展CAFE"
         "计算下推引擎为Central Server＋N×Worker集群架构，引入基于数据本地性、"
         "算力余量、合规策略的多目标智能路由算法；集成Serverless弹性调度引擎，"
         "利用AI流量预测预热技术实现毫秒级冷启动；将Model Builder前端升级为支持"
         "≥50个节点流畅拖拽连线与智能体挂载的生产级组件；联邦数据适配器≥5类全部完成。"],
        ["3",
         "编制《地理空间人工智能应用\n伦理准则与安全规范》",
         "采用安全工程与伦理治理方法，系统梳理≥10个国家与地区的测绘与地理信息"
         "法律法规，利用知识抽取技术（NER+RE+实体对齐）构建空间法律规则本体库，"
         "通过OPA策略引擎将法规约束形式化为可执行的安全策略；优化合规引擎"
         "判定路径（几何拓扑核验＋敏感语义核验），通过预编译策略缓存与并行判定"
         "技术将并发判定延迟降至<50ms；构建\"数据主权—算法公平—可解释性—问责制\""
         "四柱伦理治理框架，定义地理空间AI应用的伦理边界与审计机制。"],
    ]
    _add_table(doc, title, headers, rows, col_w)


# ═══════════════════════════════════════════════════════════
# 表2：2027年度预期成果
# ═══════════════════════════════════════════════════════════
def table_expected(doc):
    title = "表2  项目2027年度预期成果（全球地理信息智能框架研发与集成部分）"
    headers = ["时间", "成  果"]
    col_w = [Cm(2.0), Cm(14.2)]
    rows = [
        ["一季度",
         "1.完成《地理空间模型上下文协议V2.0》技术文档初稿（含四层原语定义与关键字段Schema）。"
         "2.完成GeoMCP V2.0 Java/Python双端SDK基础版更新与协议一致性测试向量（≥13个）编制。"
         "3.完成GAAG合约注册中心V2.0架构设计与PostGIS+pgvector+Neo4j三重存储技术方案评审。"
         "4.完成《地理空间人工智能应用伦理准则与安全规范》大纲设计，启动≥10国测绘法规知识抽取。"],
        ["半年度",
         "1.《协议V2.0》技术文档通过内部评审；双端SDK通过一致性测试；完成跨平台通信套件升级。"
         "2.GAAG合约注册中心V2.0完成三重存储部署与自动扫描流水线规模化验证。"
         "3.CAFE引擎完成多目标智能路由算法实现与Serverless弹性调度原型测试。"
         "4.合规引擎完成OPA策略库（≥10国）部署与判定路径优化，并发判定延迟优化至<100ms（阶段指标）。"
         "5.Model Builder完成≥50节点拖拽连线与智能体挂载功能原型。"],
        ["三季度",
         "1.《协议V2.0》双端SDK完成稳定性测试与外部接口对齐，支撑课题2/3/4协议对接。"
         "2.框架系统V2.0各组件集成测试通过，≥5个GeoWorkflow试运行。"
         "3.CAFE集群扩展至≥3个Worker节点，联邦数据适配器≥5类全部完成。"
         "4.合规引擎并发判定延迟<50ms达标；隐私增强计算（联邦/MPC/差分隐私）技术验证完成。"
         "5.《地理空间人工智能应用伦理准则与安全规范》初稿完成并进入专家评审。"],
        ["年度",
         "1.全球地理信息智能框架系统V2.0上线运行，完成成果集成、年度评审与验收。"
         "2.《地理空间模型上下文协议V2.0》技术文档终稿发布评审通过——"
         "本成果为项目成果表中2027年度课题1考核指标第1项。"
         "3.《地理空间人工智能应用伦理准则与安全规范》终稿发布评审通过——"
         "本成果为项目成果表中2027年度课题1考核指标第3项。"
         "4.配套成果：登记计算机软件著作权2项；申请发明专利3项；撰写高水平学术论文3篇。"],
    ]
    _add_table(doc, title, headers, rows, col_w)


# ═══════════════════════════════════════════════════════════
# 表3：2027年度任务考核指标
# ═══════════════════════════════════════════════════════════
def table_kpi(doc):
    title = "表3  2027年度任务考核指标（全球地理信息智能框架研发与集成课题）"
    headers = ["序号", "课题名称", "子任务名称", "任务成果", "考核指标", "评测手段/方法"]
    col_w = [Cm(0.8), Cm(3.5), Cm(3.0), Cm(2.8), Cm(3.8), Cm(2.3)]

    # 用 3 行分别对应 3 个子任务成果
    rows = [
        ["1",
         "课题1：全球地理信息\n智能框架研发与集成",
         "子任务1：\n编制《地理空间模型上下文协议V2.0》\n技术文档",
         "《地理空间模型上下文\n协议V2.0》技术文档",
         "完成四层原语定义及核心报文格式规范，包含contract_binding、pushdown_spec、federated_sources等新增字段定义；双端SDK通过协议一致性测试",
         "实验室统一组织专家评审"],
        ["",
         "",
         "子任务2：\n研发全球地理信息\n智能框架系统V2.0",
         "全球地理信息智能框架\n系统V2.0",
         "框架系统V2.0集成上线运行：GAAG合约注册中心V2.0（三重存储）、CAFE计算下推引擎V2.0（多目标路由）、低代码开发环境V2.0（Model Builder≥50节点拖拽连线与智能体挂载）；合规引擎并发判定延迟<50ms；联邦数据适配器≥5类；≥5个GeoWorkflow生产级运行",
         "第三方代码评审、测试用例评审；登记软件著作权2项"],
        ["",
         "",
         "子任务3：\n编制《地理空间人工智能应用伦理准则与安全规范》",
         "《地理空间人工智能应用\n伦理准则与安全规范》文档",
         "包含≥10国测绘法规形式化OPA策略、伦理治理四柱框架（数据主权/算法公平/可解释/问责）、隐私增强计算方案",
         "实验室统一组织专家评审"],
    ]

    # 合并单元格：序号(列0) 和课题名称(列1)
    merge_cells = [
        (1, 0, 3, 0),  # 序号 合并 row1-3
        (1, 1, 3, 1),  # 课题名称 合并 row1-3
    ]
    _add_table(doc, title, headers, rows, col_w, merge_cells)


# ═══════════════════════════════════════════════════════════
# 表4：2027年绩效表
# ═══════════════════════════════════════════════════════════
def table_perf(doc):
    title = "表4  项目2027年绩效表（全球地理信息智能框架研发与集成）"
    headers = ["一级指标", "二级指标", "三级指标", "指标值", "权重", "备注"]
    col_w = [Cm(1.6), Cm(1.6), Cm(4.5), Cm(4.5), Cm(0.9), Cm(3.1)]

    rows = [
        ["技术成果", "数量指标",
         "全球地理信息智能框架系统V2.0",
         "框架系统V2.0集成上线运行，含GAAG合约注册中心V2.0（三重存储）、CAFE计算下推引擎V2.0（多目标路由）、低代码开发环境V2.0（Model Builder≥50节点）；合规引擎并发判定<50ms；联邦数据适配器≥5类；≥5个GeoWorkflow生产级运行",
         "15%", "技术成果\n权重占70%"],
        ["", "",
         "《地理空间模型上下文协议V2.0》技术文档",
         "四层原语规范+新增字段JSON Schema+契约测试向量",
         "10%", ""],
        ["", "",
         "《地理空间人工智能应用伦理准则与安全规范》",
         "伦理治理框架+合规策略库+隐私增强计算方案",
         "8%", ""],
        ["", "",
         "软件著作权",
         "2项",
         "5%", ""],
        ["", "",
         "发明专利（申请）",
         "3项",
         "10%", ""],
        ["", "",
         "学术论文",
         "3篇（高水平）",
         "7%", ""],
        ["", "质量指标",
         "合规引擎并发判定延迟",
         "<50ms",
         "10%", ""],
        ["", "",
         "微调地理空间基础模型空间推理准确率提升",
         "≥10%（较基座模型）",
         "5%", ""],
        ["应用效益", "实效指标",
         "\"GeoNow 2027\"大会支撑保障",
         "获官方应用证明",
         "10%", "应用效益\n权重占30%"],
        ["", "",
         "Model Builder前端",
         "≥50个节点流畅拖拽连线与智能体挂载",
         "10%", ""],
        ["", "",
         "UN-GGKIC培训支撑",
         "创新中心提供系统培训证明材料",
         "10%", ""],
    ]

    # 合并：一级指标（技术成果行1-8，应用效益行9-11）
    # 二级指标（数量指标行1-6, 质量指标行7-8, 实效指标行9-11）
    merge_cells = [
        (1, 0, 8, 0),   # 技术成果 → row 1-8
        (9, 0, 11, 0),  # 应用效益 → row 9-11
        (1, 1, 6, 1),   # 数量指标 → row 1-6
        (7, 1, 8, 1),   # 质量指标 → row 7-8
        (9, 1, 11, 1),  # 实效指标 → row 9-11
        (1, 5, 8, 5),   # 备注(技术成果占70%) → row 1-8
        (9, 5, 11, 5),  # 备注(应用效益占30%) → row 9-11
    ]
    _add_table(doc, title, headers, rows, col_w, merge_cells)


# ═══════════════════════════════════════════════════════════
# 表5：2027年度计划
# ═══════════════════════════════════════════════════════════
def table_plan(doc):
    title = "表5  项目2027年度计划（全球地理信息智能框架研发与集成课题）"
    headers = ["序号", "课题名称", "子任务名称",
               "一季度成果", "半年成果", "三季度成果", "年度成果"]
    col_w = [Cm(0.7), Cm(2.6), Cm(2.2), Cm(2.7), Cm(2.7), Cm(2.7), Cm(2.6)]

    rows = [
        ["1",
         "课题1：全球地理信息\n智能框架研发与集成",
         "协议V2.0\n编制",
         "完成协议四层原语定义及核心报文格式规范草案；完成协议一致性测试向量（≥13个）编制",
         "《协议V2.0》技术文档通过内部评审；双端SDK通过一致性测试",
         "双端SDK完成稳定性测试与外部接口对齐；支撑课题2/3/4协议对接",
         "《地理空间模型上下文协议\nV2.0》技术文档终稿发布评审通过"],
        ["",
         "",
         "框架系统\nV2.0研发",
         "GAAG合约注册中心三重存储技术方案评审；CAFE多目标路由算法设计评审",
         "GAAG三重存储部署与自动扫描流水线规模化验证；CAFE多目标智能路由实现与Serverless弹性调度原型测试；Model Builder≥50节点原型完成",
         "框架系统V2.0各组件集成测试通过；≥5个GeoWorkflow试运行；CAFE集群扩展至≥3Worker节点；联邦数据适配器≥5类完成",
         "全球地理信息智能框架系统V2.0上线运行；Model Builder≥50节点流畅拖拽与智能体挂载；合规引擎并发判定<50ms"],
        ["",
         "",
         "伦理准则与\n安全规范编制",
         "完成空间法律规则本体库设计；启动≥10国测绘法规知识抽取",
         "合规引擎完成OPA策略库（≥10国）部署；并发判定延迟优化至<100ms（阶段指标）",
         "合规引擎并发判定延迟<50ms；隐私增强计算技术选型验证；伦理准则与安全规范初稿完成",
         "《地理空间人工智能应用伦理准则与安全规范》终稿发布评审通过"],
    ]

    merge_cells = [
        (1, 0, 3, 0),  # 序号
        (1, 1, 3, 1),  # 课题名称
    ]
    _add_table(doc, title, headers, rows, col_w, merge_cells)


def main():
    doc = _doc()
    table_subtasks(doc)
    table_expected(doc)
    table_kpi(doc)
    table_perf(doc)
    table_plan(doc)
    doc.save(str(OUT))
    print(f"完成 → {OUT}")


if __name__ == "__main__":
    main()