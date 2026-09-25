#!/usr/bin/env node
'use strict';
/** 把「东亚—澳大利亚迁飞区 · 优先湿地识别」案例种进平台，做到**开箱可见**。
 *
 *  这个案例复现的是 Crosby et al. 2026（Scientific Reports 16:1916,
 *  DOI 10.1038/s41598-025-31727-2）的真实研究：在 EAAF 的 10 个亚洲国家里识别出
 *  147 处对迁徙水鸟不可替代的优先湿地。数据不是我们造的 —— 站点级结果是论文
 *  补充材料 Table 3 的公开内容（CC-BY 4.0），国别汇总是正文 Table 4。
 *
 *  脚本把 SDK 侧案例的产物落到平台自己的库里与 uploads/ 下：
 *
 *    cases          案例本体（bbox / 编辑档位 public / facts 公开事实块）
 *    asset_cards    三个组成项（两份 public 数据 + 一份 restricted 受限计数）
 *    case_recipes   方案绑定（含方案全文 —— 图层视图靠它推导组成项与步骤）
 *    deliverables   四个交付物（站点表 / 取舍表 / 国别刻画表 / 报告）
 *    case_geometry  147 个真实点位（EPSG:4326，一个点就是一处优先湿地）
 *                   —— 每个点还带**逐站点的物种下标**（sp / sp10 / sp50），
 *                      用于"选一个物种、只看它达到 1% 的站点"这个视图
 *
 *  **两个必须如实说明的口径问题**（也写进了 facts，界面照实显示，不做人工对齐）：
 *
 *   1. 支撑 PC1 的**逐笔水鸟计数数据**受 Wetlands International 许可限制、未公开；
 *      公开的是站点级结果。所以本案例复核原文的取舍规则与统计量，不重算 PC1。
 *   2. 正文 Table 4 记 108 处「受保护或部分受保护」，补充材料 Table 3 的**粗体**标记
 *      是 117 处 —— 原文没有解释这 9 处的差异。两个数字都保留。
 *      （另有 2 处 PRC 站点分值低于原文声明的阈值 10 却仍在公开名单里，同样照实标注。）
 *
 *  **第三个口径问题（物种视图，原文 Fig. 3 的视角）**：补充材料的 site_species 表
 *  只公布"某个站点列了某个物种"这件事，以及 over_10pct / over_50pct 两个**布尔**标记；
 *  每个站点的**具体比例没有公布**。所以物种视图只做**站点选择**（≥1% 阈值的站点）
 *  与 10% / 50% 标注，不画比例、不按比例缩放点，也不复算百分比。
 *  另外该表 959 行的 nearly_1pct 列全部为 False（原文没有一行标它），
 *  所以界面上不设"接近 1%"这一档 —— 没有的档位不编。
 *
 *  **注**：几何是**真实公布的坐标**，因此不带 `synthetic` 标记（那是合成/示意数据
 *  的约定）。来源写在图层元数据与 facts 里。
 *
 *  用法（平台仓库根目录）：
 *      node scripts/seed-flightway-case.mjs
 *      node scripts/seed-flightway-case.mjs --case-dir ../core/examples/flightway_wetland
 *      node scripts/seed-flightway-case.mjs --dry-run
 *      node scripts/seed-flightway-case.mjs --public   # 开放演示：受限组成项也放开
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { createRequire } from 'node:module';

// ESM 脚本（与本仓库其它 scripts/*.mjs 一致）：__dirname 用 import.meta.dirname
const ROOT = path.resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const CASE_DIR = path.resolve(ROOT, flag('--case-dir', '../../core/examples/flightway_wetland'));
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, 'data');
const UPLOADS_DIR = process.env.UPLOADS_DIR ? path.resolve(process.env.UPLOADS_DIR) : path.join(ROOT, 'uploads');
const DRY_RUN = args.includes('--dry-run');
/** 开放演示：把受限组成项也标成 public。
 *  默认**不**这么做 —— 受限的逐笔计数数据是这个案例的一部分（要讲可见性继承）；
 *  但对外传播/公开教学演示时，访客看不到案例就讲不了，所以给一个显式开关。 */
const OPEN_DEMO = args.includes('--public');

const CASE_ID = 'case-eaaf-wetland-priority';
/** 方案 id 以 recipe.yaml 为准（写在文件里的是 2.0.0），这里只做兜底。 */
const RECIPE_FALLBACK = 'recipe://geonexus/eaaf-wetland-priority@2.0.0';
const SOURCE = {
  citation: 'Crosby, M., Wee, S. Q. W., Yong, D. L. et al. Identifying priority wetland sites in the East Asian–Australasian Flyway for migratory bird conservation. Scientific Reports 16, 1916 (2026).',
  doi: '10.1038/s41598-025-31727-2',
  license: 'CC-BY-4.0',
  site_table: 'Supplementary Table 3（站点级公开结果）',
  country_table: '正文 Table 4（国别汇总）',
  counts: '逐笔水鸟计数：Wetlands International 许可，未公开'
};
/** 几何：只有一个图层 —— 147 处优先湿地（真实公布的坐标）。 */
const GEOMETRY = [
  { name: 'sites', kind: 'priority-sites', file: 'sites.geojson' }
];
/** 交付物：与 recipe.yaml 的 outputs 一一对应（名称/角色/媒体类型取自方案）。 */
const DELIVERABLES = [
  { name: 'priority_sites', role: 'data', stepId: 's2', ref: 's2.sites_table',
    file: 'output/site-data/sites_normalised.csv', mediaType: 'text/csv' },
  { name: 'priority_selection', role: 'data', stepId: 's3', ref: 's3.selection_table',
    file: 'output/pc1/priority_selection.csv', mediaType: 'text/csv' },
  { name: 'country_characteristics', role: 'data', stepId: 's4', ref: 's4.country_table',
    file: 'output/characterise/country_characteristics.csv', mediaType: 'text/csv' },
  { name: 'report', role: 'knowledge', stepId: 's5', ref: 's5.report',
    file: 'output/report.html', mediaType: 'text/html' }
];
/** 三个组成项：两份公开数据 + 一份受限计数数据（可见性继承的关键）。 */
const COMPONENTS = [
  { id: 'geocard.eaaf.rfi-priority-sites', kind: 'data', title: 'EAAF 优先湿地站点级结果（147 处）',
    sensitivity: 'public',
    description: '论文补充材料 Table 3 的公开站点级结果：名称、中心坐标、PC1 分值或名次、达到 1% 的物种数、保护地与框架标记（CC-BY-4.0）',
    tags: ['eaaf', 'waterbird', 'wetland', 'priority-sites', 'cc-by-4.0'] },
  { id: 'geocard.eaaf.rfi-country-summary', kind: 'data', title: '国别汇总与保护状态（原文 Table 4）',
    sensitivity: 'public',
    description: '10 个亚洲国家的优先湿地数、沿海/内陆、受保护或部分受保护、HDI 档，以及 Ramsar / EAAFP 迁飞区网络 / 湿地 IBA-KBA 站点数',
    tags: ['eaaf', 'country-summary', 'protected-areas', 'cc-by-4.0'] },
  { id: 'geocard.eaaf.waterbird-counts-restricted', kind: 'data', title: '逐笔水鸟计数数据（受限，未公开）',
    sensitivity: 'restricted',
    description: '支撑 PC1 = Σ(nᵢ/Nᵢ)×100 的逐笔计数（亚洲水鸟普查、国家监测、eBird、专家资料）：Wetlands International 许可提供，论文声明"not publicly available"。看见它的人才看得见这个案例',
    tags: ['eaaf', 'waterbird-counts', 'restricted-licence'] }
];
/** 案例的研究区域：迁飞区覆盖 10 个亚洲国家，bbox 由 147 个真实坐标给出。 */
const REGION_LABEL = '东亚—澳大利亚迁飞区（EAAF）· 10 个亚洲国家';

function readYamlFile(file) {
  // 只做够用的解析：这里需要的是"原样存进 case_recipes.recipe"，
  // 所以宁可调用 SDK 自己的 CLI 产出 JSON，也不在这里手写 YAML 解析。
  const python = process.env.PYTHON || path.resolve(ROOT, '..', '..', '.venv-py39', 'bin', 'python');
  const code = [
    'import json,sys',
    'from geonexus.recipe import load_recipe',
    `print(json.dumps(load_recipe(sys.argv[1]).to_dict(), ensure_ascii=False))`
  ].join('\n');
  return JSON.parse(execFileSync(python, ['-c', code, file], { encoding: 'utf8' }));
}

/** 够用的 CSV 读取：这些文件是论文表格解析出来的，没有引号里的换行。 */
function readCsv(file) {
  const text = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
  const rows = [];
  let field = '';
  let row = [];
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i += 1; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (ch !== '\r') field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  const [header, ...body] = rows.filter((r) => r.length && !(r.length === 1 && r[0] === ''));
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
}

const num = (v) => (v === '' || v === null || v === undefined ? null : Number(v));
const bool = (v) => String(v).trim().toLowerCase() === 'true';

/** PC1 的大小分档 —— 与前端 `caseStyle.js` 的 SIZE_BANDS 一致。
 *  原文没有分档，这是我们为了"点的大小能读出量级"做的分箱（在对数尺度上等距）。 */
const PC1_BANDS = [
  { key: 'xl', min: 100 },
  { key: 'lg', min: 30 },
  { key: 'md', min: 10 },
  { key: 'sm', min: 3 },
  { key: 'xs', min: 0 }
];
function pc1Band(pc1) {
  // 没有 PC1 的站点（蒙古 11 处只有名次、PRC 15 处只有文字说明）走同一个档：
  // 原文没公布分值就是没公布，不该在图上再分成两种大小。
  if (pc1 === null || pc1 === undefined || Number.isNaN(pc1)) return 'rank';
  for (const band of PC1_BANDS) if (pc1 >= band.min) return band.key;
  return 'xs';
}

/** 物种的身份键：**原样**用补充材料的 (english, scientific) 组合。
 *
 *  为什么不做人工归并：这份表是论文表格解析出来的，原文换行会把一个名字切成两半 ——
 *  English 列留下 "Lesser"、"Eurasian"，后半截粘到 Scientific 列变成
 *  "SandploverCharadrius mongolus"。归并这些碎片意味着**我们来决定**它们是不是同一个物种，
 *  那就是在编物种。所以键就是原文的组合，界面照录，并把数据质量问题写在面板上。
 */
const speciesKey = (r) => `${r.english || ''}\u0000${r.scientific || ''}`;

/** 物种表（959 行 = 站点 × 物种）→ 物种索引 + 逐站点的物种下标。
 *
 *  返回的 perSite 里，每个站点的三个下标集合就是要素属性 sp / sp10 / sp50 的来源：
 *   · sp   该站点在表里列出的全部物种（"达到 1% 阈值"这件事由"被列出来"表达）；
 *   · sp10 原文 over_10pct = True 的组合；
 *   · sp50 原文 over_50pct = True 的组合。
 *  下标指向 index 数组，前端拿它做筛选与 ★/★★ 标注。
 */
function buildSpecies(speciesRows, siteIndexById) {
  const index = [];
  const byKey = new Map();
  // 物种身份用**学名**：补充材料里同一个种偶尔有第二种英文写法（PDF 折行留下的
  // 残片，如 Calidris pygmaea 的 1 行写成 'Sandpiper'）。按 (英文, 学名) 建索引会把
  // 同一个种拆成两条，勺嘴鹬就会少算一处站点。这里按学名归并，英文名取出现次数最多
  // 的写法作为规范名（不合并不同学名 —— 那才是替作者决定物种）。
  const byScientific = new Map();
  const perSite = new Map();
  const flags = { over_10pct: 0, over_50pct: 0, nearly_1pct: 0 };
  const seen = new Set();
  let orphanRows = 0;
  for (const r of speciesRows) {
    const key = r.scientific || speciesKey(r);
    const spelling = r.english || '';
    const tally = byScientific.get(key) || byScientific.set(key, new Map()).get(key);
    tally.set(spelling, (tally.get(spelling) || 0) + 1);
    let entry = byKey.get(key);
    if (!entry) {
      entry = { i: index.length, english: spelling, scientific: r.scientific || '', iucn: r.iucn || '' };
      byKey.set(key, entry);
      index.push(entry);
    } else if (!entry.iucn && r.iucn) {
      // 同一组合的续行有时空着 IUCN：取第一个非空值（不改物种身份，只补分类）
      entry.iucn = r.iucn;
    }
    // 规范英文名 = 出现次数最多的写法（并列时取更长的那个，通常是完整名）
    const best = [...tally.entries()].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)[0];
    if (best && best[0]) entry.english = best[0];
    if (bool(r.over_10pct)) flags.over_10pct += 1;
    if (bool(r.over_50pct)) flags.over_50pct += 1;
    if (bool(r.nearly_1pct)) flags.nearly_1pct += 1;
    const siteIndex = siteIndexById.get(r.site_id);
    if (siteIndex === undefined) { orphanRows += 1; continue; }
    let site = perSite.get(siteIndex);
    if (!site) { site = { sp: new Set(), sp10: new Set(), sp50: new Set(), rows: 0, dups: 0 }; perSite.set(siteIndex, site); }
    site.rows += 1;
    // 原文里同一个 (站点, 物种) 组合出现过两次（rf106 / Swan Goose），
    // 下标集合天然去重 —— 这里把去重后的组合数记下来，供"覆盖 959 行"的校验用。
    const combo = `${siteIndex}\u0000${key}`;
    if (seen.has(combo)) site.dups += 1; else seen.add(combo);
    site.sp.add(entry.i);
    if (bool(r.over_10pct)) site.sp10.add(entry.i);
    if (bool(r.over_50pct)) site.sp50.add(entry.i);
  }
  return { index, perSite, flags, orphanRows, uniqueRows: seen.size };
}

/** 站点 CSV → GeoJSON（147 个 Point，EPSG:4326，坐标为论文公布的中心点）。
 *  `species.perSite` 用站点在 CSV 里的行序作键（与 features 数组一一对应）。 */
function buildSites(rows, species) {
  const sorted = (set) => [...(set || [])].sort((a, b) => a - b);
  const features = rows.map((r, rowIndex) => {
    const pc1 = num(r.pc1);
    const rank = num(r.rank);
    const here = (species && species.perSite.get(rowIndex)) || { sp: new Set(), sp10: new Set(), sp50: new Set() };
    return {
      type: 'Feature',
      properties: {
        site_id: r.site_id,
        name: r.name,
        country: r.country,
        section: r.section,
        wetland_type: r.wetland_type,
        // 原文补充材料的粗体标记：True = 与保护地重叠
        protected: bool(r.overlaps_protected_bold),
        pc1,
        // 蒙古 11 处原文只给名次（1–11）；PRC 15 处内陆站点原文只有文字说明。
        // 前端据此用固定的小尺寸画点，并在图例里注明"原文未公布分值"。
        rank: pc1 === null ? rank : null,
        pc1_band: pc1Band(pc1),
        species_count: num(r.species_count) ?? 0,
        designations: r.designations || '',
        threatened: r.threatened || '',
        // 原文只对"没有 PC1 的站点"给了叙述性重要性说明
        importance: r.importance || '',
        // 物种视图（原文 Fig. 3 的视角）：下标指向图层元数据的 species.index。
        // 只有"被列出来"这个事实 + 两个布尔标记，没有比例 —— 比例原文没公布。
        sp: sorted(here.sp),
        sp10: sorted(here.sp10),
        sp50: sorted(here.sp50)
      },
      geometry: { type: 'Point', coordinates: [Number(r.lon), Number(r.lat)] }
    };
  });
  const lon = features.map((f) => f.geometry.coordinates[0]);
  const lat = features.map((f) => f.geometry.coordinates[1]);
  const bbox = [
    Number(Math.min(...lon).toFixed(2)), Number(Math.min(...lat).toFixed(2)),
    Number(Math.max(...lon).toFixed(2)), Number(Math.max(...lat).toFixed(2))
  ];
  return { type: 'FeatureCollection', features, bbox };
}

function main() {
  const recipePath = path.join(CASE_DIR, 'recipe.yaml');
  const rfiDir = path.join(CASE_DIR, 'data', 'rfi');
  if (!fs.existsSync(recipePath)) throw new Error(`找不到方案：${recipePath}`);
  for (const file of ['sites.csv', 'country_summary.csv', 'site_species.csv', 'PROVENANCE.md']) {
    if (!fs.existsSync(path.join(rfiDir, file))) throw new Error(`找不到数据集：${path.join(rfiDir, file)}`);
  }
  const recipe = readYamlFile(recipePath);
  const recipeId = recipe.id || RECIPE_FALLBACK;

  // 1) 数据集：站点级结果（公开）+ 国别汇总（公开）
  const siteRows = readCsv(path.join(rfiDir, 'sites.csv'));
  const countryRows = readCsv(path.join(rfiDir, 'country_summary.csv'));
  const speciesRows = readCsv(path.join(rfiDir, 'site_species.csv'));
  const siteIndexById = new Map(siteRows.map((r, i) => [r.site_id, i]));
  const species = buildSpecies(speciesRows, siteIndexById);
  const { features, bbox } = buildSites(siteRows, species);
  if (features.length !== 147) {
    throw new Error(`站点数不是 147（实际 ${features.length}）：数据集变了就要重新核对原文`);
  }
  // 物种表是逐行的：站点数变了、或者有行对不上站点，都必须当场拦下来，
  // 否则界面上会出现"某物种选了 N 个站点"而没人知道 N 是从哪来的。
  // 959 行里有 1 行是同一个 (站点, 物种) 组合的重复（原文如此）：
  // 要素上的下标集合去重，所以要比的是**去重后的组合数**，不是原始行数。
  const speciesRowTotal = features.reduce((sum, f) => sum + f.properties.sp.length, 0);
  if (speciesRowTotal !== species.uniqueRows) {
    throw new Error(`物种表覆盖不全：站点要素合计 ${speciesRowTotal} 个组合 ≠ 表里去重后 ${species.uniqueRows} 个`);
  }
  const totalDups = [...species.perSite.values()].reduce((sum, s) => sum + s.dups, 0);
  if (speciesRows.length - species.uniqueRows !== totalDups) {
    // 重复行变多/变少都要重新核对原文（现有的那条是 rf106 / Swan Goose）
    throw new Error(`物种表的重复行数对不上：原始 ${speciesRows.length} - 去重 ${species.uniqueRows} ≠ 逐站点重复 ${totalDups}`);
  }
  if (species.orphanRows) {
    throw new Error(`物种表里有 ${species.orphanRows} 行的 site_id 在站点表里不存在`);
  }
  for (const [rowIndex, f] of features.entries()) {
    const site = species.perSite.get(rowIndex) || { rows: 0, dups: 0 };
    // 站点表的 species_count 是**原始行数**（rf106 记 16 行，其中 1 行重复）
    if (site.rows !== f.properties.species_count) {
      throw new Error(`${f.properties.site_id} 的物种原始行数 ${site.rows} ≠ 站点表的 species_count ${f.properties.species_count}`);
    }
    // 要素上的下标是去重后的组合数
    if (f.properties.sp.length + site.dups !== site.rows) {
      throw new Error(`${f.properties.site_id} 的物种组合数对不上：${f.properties.sp.length} + 重复 ${site.dups} ≠ 行数 ${site.rows}`);
    }
  }

  const coastal = features.filter((f) => f.properties.wetland_type === 'coastal').length;
  const inland = features.length - coastal;
  const protectedBold = features.filter((f) => f.properties.protected).length;
  const protectedTable4 = countryRows.reduce((sum, r) => sum + (num(r.protected_or_partial) || 0), 0);
  const unprotectedTable4 = countryRows.reduce((sum, r) => sum + (num(r.unprotected) || 0), 0);
  const noScore = features.filter((f) => f.properties.pc1 === null).length;
  // 两处 PRC 站点分值低于原文声明的阈值 10，却仍在公开名单里 —— 照实标出，不改数据
  const belowThreshold = features.filter((f) => f.properties.country === 'PRC'
    && f.properties.pc1 !== null && f.properties.pc1 < 10).length;

  const facts = {
    source: SOURCE,
    region: { label: REGION_LABEL, countries: countryRows.map((r) => r.country), bbox },
    country_summary: countryRows.map((r) => ({
      country: r.country,
      priority_sites: num(r.priority_sites),
      coastal: num(r.coastal),
      inland: num(r.inland),
      protected_or_partial: num(r.protected_or_partial),
      unprotected: num(r.unprotected),
      hdi_tier: r.hdi_tier,
      ramsar_sites: num(r.ramsar_sites),
      flyway_network_sites: num(r.flyway_network_sites),
      wetland_iba_kba: num(r.wetland_iba_kba)
    })),
    totals: {
      priority_sites: features.length,
      coastal,
      inland,
      // 正文 Table 4 的口径
      protected_table4: protectedTable4,
      unprotected_table4: unprotectedTable4,
      // 补充材料粗体标记的口径（本图层的 protected 属性）
      protected_bold_marks: protectedBold,
      protected_mark_gap: protectedBold - protectedTable4,
      species_reaching_1pct: speciesRows.length,
      sites_without_pc1: noScore,
      prc_below_threshold: belowThreshold
    }
  };

  const layerProperties = {
    title: 'EAAF 优先湿地（147 处）',
    source: SOURCE,
    legend: {
      color: { coastal: '沿海湿地', inland: '内陆湿地' },
      size: [['xl', 'PC1 ≥ 100'], ['lg', '30 ≤ PC1 < 100'], ['md', '10 ≤ PC1 < 30'],
        ['sm', '3 ≤ PC1 < 10'], ['xs', 'PC1 < 3'],
        ['rank', '原文未公布分值（蒙古 11 处仅有名次；PRC 15 处仅有文字说明）']],
      protected: '与保护地重叠 = 补充材料 Table 3 的粗体标记'
    },
    counts: { total: features.length, coastal, inland, protected: protectedBold,
      unprotected: features.length - protectedBold, no_pc1: noScore },
    // 物种视图（原文 Fig. 3 的视角）：index 是物种清单，要素属性里的 sp/sp10/sp50 是下标。
    // 比例**不在**这里 —— 原文只公布"达到 1% 的站点"和两个布尔标记。
    species: {
      index: species.index,
      rows: speciesRows.length,
      rows_unique: species.uniqueRows,
      duplicate_rows: speciesRows.length - species.uniqueRows,
      species: species.index.length,
      sites_listed: features.filter((f) => f.properties.sp.length > 0).length,
      over_10pct_rows: species.flags.over_10pct,
      over_50pct_rows: species.flags.over_50pct,
      nearly_1pct_rows: species.flags.nearly_1pct,
      caveat: '补充材料只公布"该站点列了该物种"（≥1% 阈值）与 over_10pct / over_50pct 两个布尔标记；'
        + '各站点的具体比例未公布。因此本视图只做站点选择与 10% / 50% 标注，不按比例缩放点，也不复算百分比。'
        + '表中 nearly_1pct 列 959 行全部为 False，故不设"接近 1%"档。'
        + '物种名与学名按原文照录（少数条目因原文换行被截断，如 "Lesser" / "Eurasian"），未做人工归并。'
        + `原文 ${speciesRows.length} 行里有 ${speciesRows.length - species.uniqueRows} 行是同一 (站点, 物种) 组合的重复，` +
          '站点上的物种集合按组合去重。'
    }
  };

  // 2) 产物搬到平台能受控读取的地方（ARTIFACT_ROOTS 覆盖 uploads/）
  const targetDir = path.join(UPLOADS_DIR, 'cases', 'flightway');
  const planned = DELIVERABLES.map((item) => ({
    src: path.join(CASE_DIR, item.file),
    dst: path.join(targetDir, item.name + path.extname(item.file))
  }));
  for (const item of planned) {
    if (!fs.existsSync(item.src)) throw new Error(`缺少产物：${item.src}`);
  }
  if (DRY_RUN) {
    console.log(`[dry-run] 将写入 ${DATA_DIR}/geonexus.db，并复制 ${planned.length} 个文件 + ` +
      `${GEOMETRY.length} 份几何（${features.length} 个点）到 ${targetDir}`);
    return;
  }
  fs.mkdirSync(targetDir, { recursive: true });
  for (const item of planned) fs.copyFileSync(item.src, item.dst);
  for (const item of GEOMETRY) {
    // bbox 放在 FeatureCollection 上：前端 fit 到案例范围时用的是案例的 bbox，
    // 这里留一份是为了让"这份几何覆盖到哪里"能自证。
    fs.writeFileSync(path.join(targetDir, item.name + '.geojson'),
      JSON.stringify({ type: 'FeatureCollection', bbox, features }));
  }

  const dbPath = path.join(DATA_DIR, 'geonexus.db');
  const db = new DatabaseSync(dbPath);
  // 建表：**不复制 DDL**，直接让治理模块自己建（它才是 schema 的权威）。
  // 全新数据库上直接 insert 会 "no such table: cases" —— 教学场景不该要求
  // "先启动一次服务再来种数据"。
  const require = createRequire(import.meta.url);
  // 基础表：DDL 的唯一来源（server.js 调的也是它）
  require(path.join(ROOT, 'lib', 'schema.js')).initSchema(db);
  const { createGovernance } = require(path.join(ROOT, 'lib', 'governance.js'));
  const noop = () => {};
  createGovernance({
    db,
    send: noop,
    readBody: async () => ({}),
    requireAuth: () => null,
    getAuthUser: () => null,
    sdk: { registryUrl: '', listCards: async () => ({ cards: [] }), normalize: (x) => x },
    sdkWeb: {},
    recipes: { registryUrl: '', listRecipes: async () => [] },
    uploadsDir: UPLOADS_DIR,
    nowIso: () => new Date().toISOString(),
    logger: noop
  });
  const now = new Date().toISOString();
  const j = (value) => JSON.stringify(value ?? null);

  // 案例本体：bbox / facts / 编辑档位 public（组合后的可见性由组成项决定）
  db.prepare(`INSERT OR REPLACE INTO cases (id, title, question, aoi, data, processing, outputs,
              provenance, bbox, temporal, sensitivity, status, ownerUserId, geoCardId, runSpec,
              facts, createdAt, updatedAt)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    CASE_ID,
    '东亚—澳大利亚迁飞区 · 优先湿地识别（147 处）',
    '迁徙水鸟依赖的湿地成千上万，哪些是不可替代的？在 EAAF 的 10 个亚洲国家里，应当优先保护哪 147 处湿地？',
    REGION_LABEL,
    j(recipe.requires || []),
    '按原文五步复现：比较 Ramsar / EAAFP 迁飞区网络 / 湿地 IBA-KBA 三套框架 → 汇集 147 处站点与水鸟数据 → 用 1% 规则（CSR1）与 PC1 及区域校准阈值取舍 → 与各国专家核定边界 → 刻画沿海/内陆、保护状态与 HDI 并做 χ² 检验',
    j(['priority_sites', 'priority_selection', 'country_characteristics', 'report']),
    'archival',
    j(bbox),
    // 站点级结果没有单一观测年份（计数来自 2000s–2020s 的多来源普查）：
    // 与其编一个时间窗，不如如实留空，界面显示"未声明"。
    j(null),
    'public',
    'published',
    null,
    'geocard.case.eaaf-wetland-priority',
    j(null),
    j(facts),
    now, now);

  // 归属账号：asset_cards.ownerUserId 是外键，全新库上还没有任何用户。
  // 这是一个**夹具账号**（不能登录：口令哈希是占位值），只为满足归属关系。
  db.prepare(`INSERT OR IGNORE INTO users (id, name, email, passwordHash, salt, org, roles, scopes)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
    'seed-demo', '案例夹具账号', 'seed-demo@local.invalid', 'not-a-login-account', 'seed',
    'GeoNexus 案例库', j(['public_visitor']), j(['earth:view', 'case:read']));

  // 组成项：asset_cards 的 capabilityId 也是外键 —— 先建能力行，再建资产行。
  for (const component of COMPONENTS) {
    db.prepare(`INSERT OR REPLACE INTO capabilities (id, name, type, provider, nodeId, regions,
                triggers, inputs, outputs, tags, trustLevel, latencyClass, status, description,
                dependencies, agentId, graphX, graphY, createdAt, updatedAt)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      component.id, component.title, component.kind, 'GeoNexus 案例库', 'node.eaaf',
      j(['East Asia', 'Australasia']), j([]), j([]), j([]), j(component.tags),
      'community-reviewed', 'standard', 'published', component.description, j([]), null, null, null,
      now, now);
  }
  const components = OPEN_DEMO
    ? COMPONENTS.map((c) => ({ ...c, sensitivity: 'public' }))
    : COMPONENTS;
  for (const component of components) {
    db.prepare(`INSERT OR REPLACE INTO asset_cards (id, capabilityId, ownerUserId, assetKind, title,
                provider, nodeId, region, accessUrl, license, policyId, rawDataExport, inputs, outputs,
                tags, description, status, sensitivity, bbox, createdAt, updatedAt)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      component.id, component.id, 'seed-demo', component.kind, component.title,
      'GeoNexus 案例库', 'node.eaaf', 'East Asia–Australasia', '', 'CC-BY-4.0',
      // 受限的逐笔计数数据：许可证不允许再分发，策略也跟着收紧
      component.sensitivity === 'restricted' ? 'policy.restricted-licence' : 'policy.cc-by-4.0',
      component.sensitivity === 'restricted' ? 0 : 1,
      j([]), j([]), j(component.tags), component.description, 'published',
      component.sensitivity, j(component.bbox || bbox), now, now);
  }

  // 方案绑定：图层视图靠 recipe 全文推导组成项与步骤
  const paramContract = (recipe.params || []).map((p) => ({
    name: p.name, type: p.type || 'string', required: Boolean(p.required),
    default: p.default ?? null, enum: p.enum || [],
    minimum: p.minimum ?? null, maximum: p.maximum ?? null,
    scope: p.scope || 'reusable', description: p.description || ''
  }));
  const deliverableSpecs = (recipe.outputs || []).map((o) => ({
    name: o.name, from: o.from, role: o.role, mediaType: o.media_type, description: o.description
  }));
  // 绑定参数 = 方案声明的默认值（data_dir / 两道阈值 / 专家例外 / 受限计数 / 报告格式）
  const boundParams = Object.fromEntries((recipe.params || [])
    .map((p) => [p.name, p.default ?? null]));
  db.prepare(`INSERT OR REPLACE INTO case_recipes (id, caseId, recipeId, parentRecipeId, params,
              paramContract, deliverables, recipe, visibility, status, ownerUserId, createdAt, updatedAt)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    'crp-eaaf-wetland', CASE_ID, recipeId, null,
    j(boundParams), j(paramContract), j(deliverableSpecs), j(recipe),
    'public', 'approved', null, now, now);

  // 交付物：路径指向 uploads/ 下的副本（受 ARTIFACT_ROOTS 保护）
  const runId = 'run-eaaf-rfi';
  for (const item of DELIVERABLES) {
    const target = path.join(targetDir, item.name + path.extname(item.file));
    db.prepare(`INSERT OR REPLACE INTO deliverables (id, runId, caseId, stepId, name, role, mediaType,
                ref, path, sizeBytes, status, createdAt, updatedAt)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      `dlv-eaaf-${item.name}`, runId, CASE_ID, item.stepId, item.name, item.role, item.mediaType,
      item.ref, target, fs.statSync(target).size, 'ready', now, now);
  }

  // 几何：147 个真实点位（供 Cesium / MapLibre 直接渲染）
  for (const item of GEOMETRY) {
    const target = path.join(targetDir, item.name + '.geojson');
    db.prepare(`INSERT OR REPLACE INTO case_geometry (id, caseId, name, kind, path, properties, createdAt)
                VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
      `geo-eaaf-${item.name}`, CASE_ID, item.name, item.kind, target, j(layerProperties), now);
  }

  // 退役的图层与交付物：库里留着就会在 API 里重新冒出来（陈旧的 uploads 文件留着没关系，
  // 但**案例再引用它们**就等于旧演示还活着）。所以按"这次声明的清单"清一遍。
  const placeholders = (n) => Array.from({ length: n }, () => '?').join(', ');
  db.prepare(`DELETE FROM case_geometry WHERE caseId = ? AND name NOT IN (${placeholders(GEOMETRY.length)})`)
    .run(CASE_ID, ...GEOMETRY.map((g) => g.name));
  db.prepare(`DELETE FROM deliverables WHERE caseId = ? AND name NOT IN (${placeholders(DELIVERABLES.length)})`)
    .run(CASE_ID, ...DELIVERABLES.map((d) => d.name));

  const summary = {
    case: CASE_ID,
    recipe: recipeId,
    components: COMPONENTS.length,
    deliverables: DELIVERABLES.length,
    geometry: GEOMETRY.map((g) => `${g.name}（${features.length} 个点）`),
    bbox,
    sites: {
      total: features.length,
      coastal, inland,
      protected_bold: protectedBold,
      protected_table4: protectedTable4,
      unprotected: features.length - protectedBold,
      without_pc1: noScore,
      prc_below_threshold: belowThreshold
    },
    species: {
      rows: speciesRows.length,
      rows_unique: species.uniqueRows,
      duplicate_rows: speciesRows.length - species.uniqueRows,
      species_listed: species.index.length,
      sites_listed: features.filter((f) => f.properties.sp.length > 0).length,
      over_10pct_rows: species.flags.over_10pct,
      over_50pct_rows: species.flags.over_50pct,
      nearly_1pct_rows: species.flags.nearly_1pct
    },
    files_copied_to: targetDir,
    database: dbPath,
    synthetic: false,
    data_source: `${SOURCE.citation} DOI ${SOURCE.doi}（${SOURCE.license}）`,
    visibility_mode: OPEN_DEMO ? 'public（开放演示：受限计数已放开）' : 'restricted（默认：含受限计数，访客 404）'
  };
  db.close();
  console.log('已种入平台：');
  console.log(JSON.stringify(summary, null, 2));
  console.log('\n提示：几何是论文公布的**真实坐标**，因此不带 synthetic 标记；来源见图层元数据与 facts。');
  console.log('      受限的逐笔计数数据在场时，访客看不到这个案例（管理员可见）。');
}

main();
