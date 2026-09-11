#!/usr/bin/env python3
"""
Enhance 课题1 in main.docx with content from AutoGIS and CAFE papers.
Reads enhancement text from enhancements.json.
"""

import json
from docx import Document
from docx.oxml.ns import qn
from docx.oxml import OxmlElement
from copy import deepcopy

DOC_PATH = '/Users/mac/Repos/GeoNexus/docs/全球地理信息智能框架及服务系统研发（main）.docx'
JSON_PATH = '/Users/mac/Repos/GeoNexus/scripts/enhancements.json'

with open(JSON_PATH, 'r', encoding='utf-8') as f:
    content = json.load(f)

doc = Document(DOC_PATH)


def make_para_after(ref_para, text):
    """Create a new paragraph and insert it after ref_para element."""
    new_p = OxmlElement('w:p')
    ref_props = ref_para._element.find(qn('w:pPr'))
    if ref_props is not None:
        # Only copy basic formatting, skip pPr that might cause issues
        pass

    run = OxmlElement('w:r')
    rPr = OxmlElement('w:rPr')
    # Set font size to match body text (typically 12pt = 24 half-pts for Chinese docs)
    sz = OxmlElement('w:sz')
    sz.set(qn('w:val'), '24')
    rPr.append(sz)
    run.append(rPr)
    t = OxmlElement('w:t')
    t.text = text
    t.set(qn('xml:space'), 'preserve')
    run.append(t)
    new_p.append(run)

    ref_para._element.addnext(new_p)
    return new_p


def find_para_index(doc, keyword, start=0):
    """Find paragraph index by keyword substring."""
    for i, p in enumerate(doc.paragraphs):
        if i >= start and keyword in p.text:
            return i
    return None


# ================================================================
# ENHANCEMENT 1: After 研究目标 text ends [194], add fusion philosophy
# ================================================================
print("=== Enhancement 1: CAFE+AutoGIS+GeoMCP V2 Fusion Philosophy ===")
# Anchor: end of research objectives - find paragraph containing the tail of 研究目标
# The research objective ends around paragraph 194 mentioning "支撑 UN-GGKIC 高效运行"
idx1 = find_para_index(doc, '支撑 UN-GGKIC 高效运行', 187)
if idx1 is None:
    idx1 = find_para_index(doc, 'UN-GGKIC', 190)

if idx1:
    print(f"  Found anchor at paragraph {idx1}")
    make_para_after(doc.paragraphs[idx1], content['dual_agent_design'])
    print(f"  Inserted dual agent design after paragraph {idx1}")
else:
    print("  WARNING: anchor not found for Enhancement 1")

# Save intermediate
doc.save(DOC_PATH)
print("  Saved.\n")

# ================================================================
# ENHANCEMENT 2: After 主要研究内容 overview [196], add fusion philosophy
# ================================================================
print("=== Enhancement 2: Fusion Philosophy (design philosophy) ===")
doc = Document(DOC_PATH)  # Reload
idx2a = find_para_index(doc, '子任务 3', 195)
idx2a = find_para_index(doc, '开放环境下的地理空间交互标准化、默认安全体系', 186)
if idx2a is None:
    idx2a = find_para_index(doc, '标准化交互', 195)

if idx2a:
    print(f"  Found anchor at paragraph {idx2a}")
    make_para_after(doc.paragraphs[idx2a], content['fusion_philosophy'])
    print(f"  Inserted fusion philosophy after paragraph {idx2a}")
else:
    print("  WARNING: anchor not found for Enhancement 2")

doc.save(DOC_PATH)
print("  Saved.\n")

# ================================================================
# ENHANCEMENT 3: After 子任务1 content [204], add CAFE architecture details
# ================================================================
print("=== Enhancement 3: CAFE Architecture Details ===")
doc = Document(DOC_PATH)
idx3 = find_para_index(doc, '跨终端的一致可视化呈现', 195)
if idx3 is None:
    idx3 = find_para_index(doc, '安全分发与调度', 200)

if idx3:
    print(f"  Found anchor at paragraph {idx3}")
    make_para_after(doc.paragraphs[idx3], content['cafe_architecture_detail'])
    print(f"  Inserted CAFE architecture detail after paragraph {idx3}")
else:
    print("  WARNING: anchor not found for Enhancement 3")

doc.save(DOC_PATH)
print("  Saved.\n")

# ================================================================
# ENHANCEMENT 4: After 拟解决的科学问题 [216], add QGIS-GPT reference
# ================================================================
print("=== Enhancement 4: QGIS-GPT Training Strategy ===")
doc = Document(DOC_PATH)
idx4 = find_para_index(doc, '普惠化高效服务', 209)
if idx4 is None:
    idx4 = find_para_index(doc, '拟解决的重大科学', 200)

# Actually let me find the end of the technical problems section
if idx4:
    print(f"  Found anchor at paragraph {idx4}")
    make_para_after(doc.paragraphs[idx4], content['qgis_gpt_reference'])
    print(f"  Inserted QGIS-GPT reference after paragraph {idx4}")
else:
    print("  WARNING: anchor not found for Enhancement 4")

doc.save(DOC_PATH)
print("  Saved.\n")

# ================================================================
# ENHANCEMENT 5: After 子任务1 in Section 6 [356], add detailed content
# ================================================================
print("=== Enhancement 5: Section 6 Subtask 1 Enhancement ===")
doc = Document(DOC_PATH)
idx5 = find_para_index(doc, '子任务 1：地理空间数据与模型交互标准化研究', 350)
if idx5:
    # Find the end of subtask 1 content - look for the spatial alignment paragraph
    idx5_end = find_para_index(doc, '跨终端的一致可视化呈现', idx5)
    if idx5_end is None:
        idx5_end = find_para_index(doc, '自适应渲染指令集', idx5)
    if idx5_end is None:
        idx5_end = find_para_index(doc, '子任务 2', idx5)
    if idx5_end:
        # Insert before 子任务2
        idx5_target = idx5_end
        print(f"  Found anchor at paragraph {idx5_target}")
        make_para_after(doc.paragraphs[idx5_target], content['section6_subtask1_enhance'])
        print(f"  Inserted section 6 subtask 1 enhancement after paragraph {idx5_target}")
    else:
        print("  WARNING: end anchor not found")
else:
    print("  WARNING: section 6 subtask 1 not found")

doc.save(DOC_PATH)
print("  Saved.\n")

# ================================================================
# ENHANCEMENT 6: After 子任务2 in Section 6, add code repair details
# ================================================================
print("=== Enhancement 6: Code Agent Self-Repair Loop ===")
doc = Document(DOC_PATH)
idx6 = find_para_index(doc, '子任务 3：低代码智能开发环境与公共产品共享生态', 350)
if idx6:
    print(f"  Found anchor at paragraph {idx6}")
    make_para_after(doc.paragraphs[idx6], content['code_agent_repair'])
    print(f"  Inserted code agent repair after paragraph {idx6}")
else:
    print("  WARNING: anchor not found for Enhancement 6")

doc.save(DOC_PATH)
print("  Saved.\n")

print("\n=== ALL ENHANCEMENTS APPLIED ===")
print(f"Output: {DOC_PATH}")
