#!/usr/bin/env python3
"""
Apply yellow highlighting to newly inserted paragraphs in the enhanced main.docx,
then save as -enhanced copy.
"""

import json
from docx import Document
from docx.oxml.ns import qn
from docx.oxml import OxmlElement
from copy import deepcopy

DOC_PATH = '/Users/mac/Repos/GeoNexus/docs/全球地理信息智能框架及服务系统研发（main）.docx'
OUT_PATH = '/Users/mac/Repos/GeoNexus/docs/全球地理信息智能框架及服务系统研发（main）-enhanced.docx'
JSON_PATH = '/Users/mac/Repos/GeoNexus/scripts/enhancements.json'

with open(JSON_PATH, 'r', encoding='utf-8') as f:
    content = json.load(f)

# All inserted text signatures (first ~80 chars of each enhancement block)
signatures = [
    content['fusion_philosophy'][:80],
    content['dual_agent_design'][:80],
    content['qgis_gpt_reference'][:80],
    content['cafe_architecture_detail'][:80],
    content['code_agent_repair'][:80],
    content['section6_subtask1_enhance'][:80],
]

doc = Document(DOC_PATH)

highlighted_count = 0

for para in doc.paragraphs:
    text = para.text.strip()
    if not text:
        continue

    # Check if this paragraph is one of our insertions
    is_inserted = False
    for sig in signatures:
        if text.startswith(sig[:60]):
            is_inserted = True
            break

    if is_inserted:
        # Apply yellow highlight to all runs in this paragraph
        for run in para.runs:
            rPr = run._element.find(qn('w:rPr'))
            if rPr is None:
                rPr = OxmlElement('w:rPr')
                run._element.insert(0, rPr)
            highlight = OxmlElement('w:highlight')
            highlight.set(qn('w:val'), 'yellow')
            rPr.append(highlight)

        highlighted_count += 1
        print(f"  Highlighted [{highlighted_count}]: {text[:80]}...")

doc.save(OUT_PATH)
print(f"\nDone. {highlighted_count} paragraphs highlighted.")
print(f"Output: {OUT_PATH}")
