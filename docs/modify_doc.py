#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
基于修改建议与补充材料，对项目实施方案进行系统性修改。
修改部分使用黄色高亮显示。
"""

from docx import Document
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

def add_highlighted_run(paragraph, text):
    """在段落末尾添加黄色高亮的文本"""
    run = paragraph.add_run(text)
    r = run._r
    rPr = r.get_or_add_rPr()
    highlight = OxmlElement('w:highlight')
    highlight.set(qn('w:val'), 'yellow')
    rPr.append(highlight)
    return run


def main():
    input_path = "/Users/mac/Repos/GeoNexus/docs/平台项目实施方案 - 614（不含预算）.docx"
    output_path = "/Users/mac/Repos/GeoNexus/docs/实施方案615.docx"

    print(f"正在读取文档: {input_path}")
    doc = Document(input_path)
    print(f"文档加载完成，共 {len(doc.paragraphs)} 个段落，{len(doc.tables)} 个表格")

    # ==================== 修改1: 项目背景与意义 ====================
    print("\n[修改1] 项目背景与意义 - 补充前期研究基础...")
    para = doc.paragraphs[18]
    add_highlighted_run(para, "\n\n【修改内容】本项目在方案设计过程中，充分吸收了国内外在时空智能计算、分布式协同分析和自动化GIS智能体等领域的前沿研究成果。武汉大学龚健雅院士团队研发的开放地球引擎（OGE）为本项目时空数据组织与分布式计算提供了重要的底层技术支撑，其GeoCube时空立方体模型和云原生分布式计算能力将作为GeoNode的核心实现方案。清华团队提出的CAFE协同式分析框架为本项目联邦式计算架构设计提供了理论参考，其\"数据不动计算动\"的分布式协同理念将融入GeoMCP协议设计。AutoGIS框架的合同驱动数据管理和智能体设计思想为本项目GeoAgent编排层的实现提供了重要借鉴，其基于GAKG的数据智能体和基于QGIS-GPT的代码智能体设计将直接应用于GeoAgent的开发。本项目将在这些前期成果基础上，面向全球地理信息智能服务需求，进行系统性的集成创新与工程化实现。")
    print("  -> 已添加前期研究基础说明")

    # ==================== 修改2: 研究现状 - 增加OGE、AutoGIS综述 ====================
    print("\n[修改2] 研究现状 - 补充OGE和AutoGIS研究现状...")
    for i, para in enumerate(doc.paragraphs):
        if '云原生算力底座与低代码普惠智能服务现状' in para.text and len(para.text) < 200:
            add_highlighted_run(para, "\n\n【修改内容】（6）时空智能计算引擎与自动化地理空间智能体的发展。以OGE为代表的开放地球引擎通过设计GeoCube时空立方体模型，实现了多源异构时空数据的统一组织，其云原生弹性分布式计算能力为大规模时空数据分析提供了高效底座。OGE的学习型时空计算技术通过数据驱动的机器学习方法刻画计算强度，实现了分布式环境下的AI负载均衡，其AI Cube框架支持CPU/GPU协同推理，为GeoAI提供了经过验证的计算基础设施。与此同时，AutoGIS框架通过合同驱动的数据管理和代码合成，实现了从自然语言意图到地理空间分析的全自动闭环。其数据智能体基于GAKG实现多源异构数据的自动发现和对齐，代码智能体基于QGIS-GPT实现合同约束下的代码生成和自修复。这些进展表明，全球地理信息智能服务正在从\"工具平台化\"走向\"智能体服务化\"，为本项目GeoAgent和GeoSkill的设计提供了重要的技术参考。")
            print(f"  -> 已在段落{i}添加OGE和AutoGIS综述")
            break

    # ==================== 修改3: 课题1 - 细化技术路线，引入OGE、CAFE、AutoGIS ====================
    print("\n[修改3] 课题1研究内容 - 引入OGE、CAFE、AutoGIS技术...")
    for i, para in enumerate(doc.paragraphs):
        if '低代码智能开发环境与公共产品共享生态机制研究' in para.text and len(para.text) < 200:
            add_highlighted_run(para, "\n\n【修改内容】本课题将充分借鉴AutoGIS框架的合同驱动设计理念，将数据合同（Data Contract）和算法合同（Algorithm Contract）机制融入GeoMCP协议和GeoSkill标准。通过引入地理空间资产知识图谱（GAKG）和多层记忆系统（工作记忆、情景记忆、语义记忆、程序记忆），提升GeoAgent的自主编排和自闭环修复能力。同时，本课题将OGE的时空立方体组织模型和分布式计算能力作为GeoNode参考实现的核心技术基础，利用CubeRDD和AI Cube实现GeoSkill的高效执行和分布式推理。在联邦计算方面，借鉴CAFE框架的分布式协同分析思想，设计支持数据本地化的GeoMCP联邦计算原语，确保敏感地理空间数据的安全协同分析。")
            print(f"  -> 已在段落{i}添加课题1技术路线补充")
            break

    # ==================== 修改4: 课题2 - 明确与OGE的集成关系 ====================
    print("\n[修改4] 课题2研究内容 - 明确OGE集成关系...")
    for i, para in enumerate(doc.paragraphs):
        if '场景化智能体与开放服务构建' in para.text and len(para.text) < 200:
            add_highlighted_run(para, "\n\n【修改内容】本课题将充分利用OGE的时空立方体管理和分布式计算能力，将卫星影像预处理、AI解译等任务封装为GeoSkill，通过GeoMCP协议进行标准化调用。OGE的GeoCube将为多源卫星数据提供统一的时空组织基准，其CubeRDD分布式计算能力将支撑大规模影像数据的并行处理。同时，借鉴AutoGIS数据智能体的设计理念，实现卫星资源的自动发现、预处理和元数据提取，构建基于GeoCard的卫星资源知识库。通过合同驱动的数据管理，确保卫星数据在发现、处理、分发全过程中的数据一致性和可追溯性。")
            print(f"  -> 已在段落{i}添加课题2技术路线补充")
            break

    # ==================== 修改5: 课题3 - 明确基于GeoMCP和CAFE的工作流 ====================
    print("\n[修改5] 课题3研究内容 - 补充GeoMCP和CAFE工作流...")
    for i, para in enumerate(doc.paragraphs):
        if '模拟推演与决策支持' in para.text and 'SDG' in para.text.upper() and len(para.text) < 300:
            add_highlighted_run(para, "\n\n【修改内容】本课题将借鉴CAFE协同式分析框架的分布式协同理念，结合GeoMCP协议的联邦计算原语，设计支持数据本地化的SDG评估工作流。通过将系统动力学模型和多目标优化算法封装为GeoSkill，实现跨国界敏感数据的安全协同分析。OGE的时空立方体将作为SDG多源数据融合的统一数据底座，其分布式计算能力将支撑大规模SDG指标计算和情景模拟。同时，参考AutoGIS的合同驱动机制，确保多源SDG数据在融合过程中的数据一致性和分析可追溯性，实现从数据融合到决策支持的端到端可信分析。")
            print(f"  -> 已在段落{i}添加课题3技术路线补充")
            break

    # ==================== 修改6: 课题4 - 明确与GeoMCP和知识图谱的关系 ====================
    print("\n[修改6] 课题4研究内容 - 补充GeoMCP和知识图谱关系...")
    for i, para in enumerate(doc.paragraphs):
        if '知识库与知识图谱构建' in para.text and len(para.text) < 200:
            add_highlighted_run(para, "\n\n【修改内容】本课题构建的知识图谱将与GeoMCP协议的GeoCard标准深度整合，知识图谱中的实体将作为GeoCard的重要组成部分，提升GeoSkill的语义检索和智能推荐能力。借鉴AutoGIS的GAKG设计，构建支持多源异构数据融合的地理空间资产知识图谱，为GeoAgent的自主编排提供知识支撑。同时，参考AutoGIS的多层记忆系统设计，将工作记忆、情景记忆、语义记忆和程序记忆融入远程学习系统，实现个性化的学习路径推荐和案例检索。OGE的时空立方体将为知识图谱提供时空数据底座，支撑时空推理和动态知识更新。")
            print(f"  -> 已在段落{i}添加课题4技术路线补充")
            break

    # ==================== 修改7: 创新性 - 明确与现有技术的差异化 ====================
    print("\n[修改7] 创新性部分 - 明确技术差异化...")
    for i, para in enumerate(doc.paragraphs):
        if '创新点 1' in para.text and 'GeoMCP' in para.text:
            add_highlighted_run(para, "\n\n【修改内容】本创新点的特色在于：不是从零开始设计一套全新的协议体系，而是在已有MCP协议和OGE时空计算引擎的基础上，进行地理空间领域的扩展和适配。GeoMCP协议与MCP保持兼容性，同时扩展了空间上下文、地理计算语义和数据主权标识等专用原语。OGE作为GeoNode的核心实现方案之一，提供了经过验证的时空数据组织和分布式计算能力。AutoGIS的合同驱动机制为协议的安全性和可靠性提供了保障。这种\"协议扩展+引擎集成+合同保障\"的模式，既保证了技术的先进性和开放性，又降低了协议推广的技术门槛。")
            print(f"  -> 已在段落{i}添加创新点1补充说明")
            break

    # ==================== 修改8: 考核指标 - 调整可行性指标 ====================
    print("\n[修改8] 考核指标 - 调整部分指标...")
    for i, para in enumerate(doc.paragraphs):
        if '低代码智能开发环境与共享生态' in para.text and '注册专家用户' in para.text:
            add_highlighted_run(para, "\n\n【修改内容】考核指标调整建议：原指标\"开源社区门户注册专家用户≥100人，年度新增案例≥50个，用户满意度≥85%\"调整为\"在不少于3个发展中国家开展用户测试，有效反馈样本≥50份，NPS评分≥30；开源社区门户注册专家用户≥50人，年度新增GeoSkill≥20个，用户满意度≥80%（基于有效反馈样本）\"。调整原因：考虑到发展中国家的网络基础设施和数字素养现状，初期用户规模和满意度目标应更加务实，重点关注GeoSkill的实用性和用户反馈质量。")
            print(f"  -> 已在段落{i}添加考核指标调整说明")
            break

    # ==================== 修改9: 课题接口关系 - 补充OGE、CAFE、AutoGIS的接口定位 ====================
    print("\n[修改9] 课题接口关系 - 补充技术接口说明...")
    for i, para in enumerate(doc.paragraphs):
        if '课题内部之间接口关系' in para.text:
            add_highlighted_run(para, "\n\n【修改内容】OGE、CAFE、AutoGIS在项目中的接口定位：OGE作为GeoNode的核心实现方案，通过GeoMCP协议与上层应用系统对接，提供时空数据组织和分布式计算能力。CAFE的分布式协同分析理念融入GeoMCP协议的联邦计算原语，支撑课题3的跨国界SDG评估。AutoGIS的合同驱动机制作为GeoMCP协议安全层的重要组成部分，其GAKG和多层记忆系统为课题4的知识图谱构建和课题1的GeoAgent编排提供技术参考。三者通过GeoMCP协议实现松耦合集成，形成有机整体。")
            print(f"  -> 已在段落{i}添加课题接口关系补充")
            break

    # ==================== 保存文档 ====================
    print(f"\n正在保存文档到: {output_path}")
    doc.save(output_path)
    print("文档保存完成！")
    print(f"\n共完成9处系统性修改，所有修改内容均以黄色高亮显示。")
    print(f"修改涵盖：项目背景、研究现状、课题1-4技术路线、创新性、考核指标、课题接口关系等关键部分。")


if __name__ == "__main__":
    main()
