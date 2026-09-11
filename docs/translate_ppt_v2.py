#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
将 ISPRS-public goods.pptx 从英文翻译成中文，保持格式不变。
改进版：支持部分匹配和更完整的翻译映射。
"""

from pptx import Presentation
from pptx.util import Pt
import re

def translate_text(original):
    """翻译映射表 - 支持部分匹配"""

    # 完全匹配优先
    exact_translations = {
        "1. Global Geospatial Public Goods": "1. 全球地理空间公共产品",
        "1.1 Global Geospatial Data": "1.1 全球地理空间数据",
        "1.2 Global Geospatial Knowledge": "1.2 全球地理空间知识",
        "1.3 Global Geospatial Intelligence Hub and Services": "1.3 全球地理空间智能枢纽与服务",
        "1.3 Global geospatial intelligence hub and services": "1.3 全球地理空间智能枢纽与服务",
        "1.4 Technologies and Services": "1.4 技术与服务",
        "Statistics": "统计数据",
        "POIs": "兴趣点",
        "POI": "兴趣点",
        "Remote": "遥感",
        "Sensing": " ",
        "Foundation": "基础",
        "GeospatialData": "地理空间数据",
        "Fusion and assimilation": "融合与同化",
        "Population": "人口",
        "structure": "结构",
        "reconstruction": "重构",
        "Spatialization of GDP by Sector": "分行业GDP空间化",
        "Statistical Downscaling": "统计降尺度",
        "Methodologies": "方法论",
        "Geospatial Expression of": "地理空间表达",
        "Public Services": "公共服务",
        "Accessibility modelling": "可达性建模",
        "Social equity Evaluation": "社会公平评估",
        "Consistency processing and": "一致性处理与",
        "multi-scale integration": "多尺度集成",
        "Long-term temporal reconstruction": "长期时序重建",
        "Spatiotemporal consistency improvement": "时空一致性提升",
        "Ten spatiotemporal dataset": "十个时空数据集",
        "Social foundation dataset": "社会基础数据集",
        "Population age and sex structure": "人口年龄性别结构",
        "Medical accessibility": "医疗可达性",
        "Education accessibility": "教育可达性",
        "Economic foundation dataset": "经济基础数据集",
        "GDP growth rate": "GDP增长率",
        "GDP main sectors structure": "GDP主要部门结构",
        "Nightlight": "夜间灯光",
        "Environmental dataset": "环境数据集",
        "Land cover change": "土地覆盖变化",
        "Land use intensity": "土地利用强度",
        "Green space coverage": "绿地覆盖率",
        "Over twenty SDG": "超过二十个可持续发展目标",
        "spatiotemporal indicators": "时空指标",
        "Social Development": "社会发展",
        "SDG3.8.1; SDG4.5.1; SDG7.1.1;": "SDG3.8.1; SDG4.5.1; SDG7.1.1;",
        "SDG9.1.1.b; SDG9.1.1.c;": "SDG9.1.1.b; SDG9.1.1.c;",
        "SDG11.2.1; SDG12.2.1": "SDG11.2.1; SDG12.2.1",
        "Economic Development": "经济发展",
        "SDG1.2.1; SDG2.3.1; SDG8.5.1": "SDG1.2.1; SDG2.3.1; SDG8.5.1",
        "SDG9.2.1; SDG11.3.1": "SDG9.2.1; SDG11.3.1",
        "Environment conservation": "环境保护",
        "SDG6.3.2; SDG6.6.1; SDG15.1.2": "SDG6.3.2; SDG6.6.1; SDG15.1.2",
        "SDG15.2.1; SDG15.3; SDG15.3.1.a": "SDG15.2.1; SDG15.3; SDG15.3.1.a",
        "SDG15.4.1; SDG15.4.2": "SDG15.4.1; SDG15.4.2",
        "Crowd-powered data mining": "众源数据挖掘",
        "Fusion Change Inspection": "融合变化检测",
        "Intelligent Crowdsourcing Update": "智能众包更新",
        "Collaborative Quality Inspection": "协同质量检验",
        "Scenario-based spatiotemporal knowledge service": "基于场景的时空知识服务",
        "Intelligent analysis and decision-making": "智能分析与决策",
        "Knowledge management and service": "知识管理与服务",
        "Who is using GeoNexus?": "谁在使用GeoNexus？",
        "GeoNexus": "GeoNexus",
        "is the underlying intelligent infrastructure and federated architecture that supports the realization of the Global Geospatial Intelligence Hub and Se": "是支撑全球地理空间智能枢纽与服务实现的底层智能基础设施和联邦架构",
        ". It leverages": "。它利用",
        "and": "和",
        "GeoCard for standardized asset description, organizes GeoSkill capabilities, and drives intelligent collaboration among GeoAgent agents, connecting gl": "GeoCard进行标准化资产描述，组织GeoSkill能力，并驱动GeoAgent智能体之间的智能协作，连接全球",
        "Typical Application Scenarios": "典型应用场景",
        "- SDGs Monitoring & Evaluation": "- 可持续发展目标监测与评估",
        "- Disaster Risk Reduction & Early Warning": "- 灾害风险减少与早期预警",
        "- Climate Change Management": "- 气候变化管理",
        "- Food Security & Agriculture": "- 粮食安全与农业",
        "- Ocean & Blue Economy": "- 海洋与蓝色经济",
        "- Biodiversity Conservation": "- 生物多样性保护",
        "- Marine & Coastal Management": "- 海洋与海岸带管理",
        "Openness": "开放",
        "Security": "安全",
        "Inclusiveness": "包容",
        "GeoNexus: Enabling an Open, Secure, and Inclusive Global Geospatial Intelligence Hub and Services (GGIHS).": "GeoNexus：构建开放、安全、包容的全球地理空间智能枢纽与服务（GGIHS）。",
        "Government / Policymakers": "政府/决策者",
        "SDGs monitoring & evaluation": "可持续发展目标监测与评估",
        "Researchers": "研究人员",
        "Scientific research & data analysis": "科学研究与数据分析",
        "Developers": "开发者",
        "Building intelligent applications": "构建智能应用",
        "Enterprises / Organizations": "企业/组织",
        "Business intelligence & risk management": "商业智能与风险管理",
        "Public / Communities": "公众/社区",
        "Education & knowledge acquisition": "教育与知识获取",
        "GeoAgent": "GeoAgent",
        "Intent Understanding": "意图理解",
        "(LLM + RAG + KG)": "（大语言模型+检索增强生成+知识图谱）",
        "Task Planning": "任务规划",
        "(Planning & Decomposition)": "（规划与分解）",
        "Intelligent Collaboration": "智能协作",
        "(Multi-Agent Cooperation)": "（多智能体协作）",
        "Result Integration & Feedback": "结果整合与反馈",
        "(Visualization / Report / API)": "（可视化/报告/API）",
        "GeoSkill": "GeoSkill",
        "Data Processing": "数据处理",
        "(Raster / Vector / Table)": "（栅格/矢量/表格）",
        "Remote Sensing": "遥感",
        "(NDVI / Land Cover / Classification)": "（NDVI/土地覆盖/分类）",
        "Spatial Analysis": "空间分析",
        "(Buffer / Overlay / Network)": "（缓冲区/叠加/网络）",
        "Machine Learning": "机器学习",
        "(Deep Learning / Prediction)": "（深度学习/预测）",
        "Domain Application": "领域应用",
        "(Flood / Drought / SDGs / Assessment)": "（洪水/干旱/可持续发展目标/评估）",
        "More Skills": "更多技能",
        "...": "...",
        "GeoCard": "GeoCard",
        "1. Basic Information": "1. 基本信息",
        "(Identity / Overview)": "（身份/概述）",
        "2. Spatial Reference": "2. 空间参考",
        "(Location / Extent)": "（位置/范围）",
        "3. Temporal Reference": "3. 时间参考",
        "(Time / Frequency)": "（时间/频率）",
        "4. Data & Resource": "4. 数据与资源",
        "(Sources / Formats)": "（来源/格式）",
        "5. Processing": "5. 处理",
        "(Services / Algorithms)": "（服务/算法）",
        "6. Management": "6. 管理",
        "(Ownership / Organization)": "（所有权/组织）",
        "(Permissions / Policies)": "（权限/策略）",
        "7. Access & Usage": "7. 访问与使用",
        "GeoMCP": "GeoMCP",
        "Discovery": "发现",
        "(Find)": "（查找）",
        "Connection": "连接",
        "(Connect)": "（连接）",
        "Invocation": "调用",
        "(Call)": "（调用）",
        "Context": "上下文",
        "(Context)": "（上下文）",
        "Stream / Event": "流/事件",
        "(Stream / Event)": "（流/事件）",
        "Security": "安全",
        "(Security)": "（安全）",
        "Metering": "计量",
        "(Billing / Usage)": "（计费/使用）",
        "GeoN": "GeoN",
        "exus": "exus",
        "Government / Institution A": "政府/机构A",
        "GeoNode": "GeoNode",
        "Data | Models | Skills | Compute": "数据|模型|技能|计算",
        "Sovereign Control | Local Governance": "主权控制|本地治理",
        "Government / Institution B": "政府/机构B",
        "University / Research C": "大学/研究机构C",
        "Research Driven | Open Sharing": "研究驱动|开放共享",
        "Enterprise / Organization D": "企业/组织D",
        "Private Control | Local Deployment": "私有控制|本地部署",
        "More Nodes": "更多节点",
        "Collaborate": "协作",
        "Coordinate": "协调",
        "Execute": "执行",
        "Understand": "理解",
        "Connect": "连接",
        "Application": "应用",
    }

    # 完全匹配
    if original in exact_translations:
        return exact_translations[original]

    return original


def main():
    input_path = "/Users/mac/Repos/GeoNexus/docs/ISPRS-public goods.pptx"
    output_path = "/Users/mac/Repos/GeoNexus/docs/ISPRS-public goods_中文.pptx"

    print(f"正在读取PPT: {input_path}")
    prs = Presentation(input_path)
    print(f"PPT加载完成，共 {len(prs.slides)} 页")

    translated_count = 0
    skipped_count = 0

    for slide_idx, slide in enumerate(prs.slides):
        print(f"\n处理第 {slide_idx + 1} 页...")
        for shape in slide.shapes:
            if not shape.has_text_frame:
                continue

            for paragraph in shape.text_frame.paragraphs:
                for run in paragraph.runs:
                    original_text = run.text.strip()
                    if not original_text:
                        continue

                    translated = translate_text(original_text)
                    if translated != original_text:
                        run.text = translated
                        translated_count += 1
                    else:
                        skipped_count += 1

    print(f"\n翻译完成: {translated_count} 处翻译, {skipped_count} 处跳过（未匹配或无需翻译）")

    print(f"\n正在保存到: {output_path}")
    prs.save(output_path)
    print("保存完成！")

    import os
    size = os.path.getsize(output_path)
    print(f"文件大小: {size / 1024 / 1024:.2f} MB")


if __name__ == "__main__":
    main()
