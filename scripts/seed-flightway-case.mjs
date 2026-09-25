#!/usr/bin/env node
'use strict';
/** 把「候鸟—湿地（EAAF 优先湿地）」案例种进平台，做到**开箱可见**。
 *
 *  教学与传播要的是"打开就能看"，不是"照着文档敲五条命令"。所以这个脚本把
 *  SDK 侧案例的产物落到平台自己的库里与 uploads/ 下：
 *
 *    cases          案例本体（bbox / 数据时间 / 编辑档位 public）
 *    asset_cards    三个组成项（两份 public 数据 + 一份 restricted 精确点位）
 *    case_recipes   方案绑定（含方案全文 —— 图层视图靠它推导组成项）
 *    deliverables   三个交付物（水面变化栅格 / 优先地点表 / 报告）
 *    case_geometry  矢量化后的几何（水面变化面、基线水面、点位）
 *
 *  **限制说明**：写入的是**合成/示意**数据的产物。每个几何要素都带
 *  `synthetic: true`，案例描述里也写明 —— 地图上的"合成为示意"标注来自数据本身。
 *
 *  用法（平台仓库根目录）：
 *      node scripts/seed-flightway-case.mjs
 *      node scripts/seed-flightway-case.mjs --case-dir ../core/examples/flightway_wetland
 *      node scripts/seed-flightway-case.mjs --dry-run
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
/** 开放演示：把受限点位也标成 public。
 *  默认**不**这么做 —— 精确点位受限是这个案例的一部分（要讲可见性继承）；
 *  但对外传播/公开教学演示时，访客看不到案例就讲不了，所以给一个显式开关。 */
const OPEN_DEMO = args.includes('--public');

const CASE_ID = 'case-eaaf-wetland-priority';
const RECIPE_ID = 'recipe://geonexus/eaaf-wetland-priority@1.0.0';
const GEOMETRY = [
  { name: 'water_change', kind: 'change-polygons', file: 'water_change.geojson',
    properties: { title: '水面变化（损失 / 增加）', classes: ['loss', 'gain'] } },
  { name: 'water_baseline', kind: 'water-extent', file: 'water_baseline.geojson',
    properties: { title: '基线水面范围' } },
  { name: 'sites', kind: 'sample-points', file: 'sites.geojson',
    properties: { title: '示意地点（按 PC1 分级）', legend: { bands: [
      { min: 0.5, band: 'high', label: 'PC1 ≥ 0.5' },
      { min: 0.25, band: 'medium', label: '0.25 ≤ PC1 < 0.5' },
      { min: 0, band: 'low', label: 'PC1 < 0.25' }
    ] } } }
];
const DELIVERABLES = [
  { name: 'water_change_map', role: 'data', stepId: 's3', ref: 's3.change_raster',
    file: 'output/water_change.tif', mediaType: 'image/tiff' },
  { name: 'priority_sites', role: 'data', stepId: 's4', ref: 's4.priority_table',
    file: 'output/priority_sites.csv', mediaType: 'text/csv' },
  { name: 'report', role: 'knowledge', stepId: 's5', ref: 's5.report',
    file: 'output/report.html', mediaType: 'text/html' }
];
/** 三个组成项：两份公开数据 + 一份受限精确点位（可见性继承的关键）。 */
const COMPONENTS = [
  { id: 'geocard.eaaf.wetland-imagery-sample', kind: 'data', title: '合成影像栈（样例）',
    sensitivity: 'public', bbox: [120.30, 32.60, 121.40, 33.40],
    description: 'green/nir 两波段合成栈（Sentinel-2 B03/B08 的形状）' },
  { id: 'geocard.eaaf.waterbird-counts-sample', kind: 'data', title: '水鸟计数与种群量（样例）',
    sensitivity: 'public', bbox: [120.30, 32.60, 121.40, 33.40],
    description: '地点 × 物种 × 数量 + 种群量（示意值）' },
  { id: 'geocard.eaaf.priority-sites-restricted', kind: 'data', title: '优先湿地精确点位（受限）',
    sensitivity: 'restricted', bbox: [120.30, 32.60, 121.40, 33.40],
    description: '精确坐标会指向可被干扰的停歇地，因此受限：看不见它的人，也看不见这个案例' }
];

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

function main() {
  const recipePath = path.join(CASE_DIR, 'recipe.yaml');
  // 几何在 run 的工作目录下（output/geometry/，export_geojson.py 的默认输出）
  const geoDir = path.join(CASE_DIR, 'output', 'geometry');
  const geoManifest = path.join(geoDir, 'manifest.json');
  if (!fs.existsSync(recipePath)) throw new Error(`找不到方案：${recipePath}`);
  if (!fs.existsSync(geoManifest)) {
    throw new Error(`找不到几何：${geoManifest}；先跑 run_case.py 与 export_geojson.py`);
  }
  const recipe = readYamlFile(recipePath);

  // 1) 产物搬到平台能受控读取的地方（ARTIFACT_ROOTS 覆盖 uploads/）
  const targetDir = path.join(UPLOADS_DIR, 'cases', 'flightway');
  const planned = [];
  for (const item of DELIVERABLES) {
    planned.push({ src: path.join(CASE_DIR, item.file), dst: path.join(targetDir, item.name + path.extname(item.file)) });
  }
  for (const item of GEOMETRY) {
    planned.push({ src: path.join(geoDir, path.basename(item.file)), dst: path.join(targetDir, item.name + '.geojson') });
  }
  for (const item of planned) {
    if (!fs.existsSync(item.src)) throw new Error(`缺少产物：${item.src}`);
  }
  if (DRY_RUN) {
    console.log(`[dry-run] 将写入 ${DATA_DIR}/geonexus.db，并复制 ${planned.length} 个文件到 ${targetDir}`);
    return;
  }
  fs.mkdirSync(targetDir, { recursive: true });
  for (const item of planned) fs.copyFileSync(item.src, item.dst);

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

  // 案例本体：bbox / 数据时间 / 编辑档位 public（组合后的可见性由组成项决定）
  const bbox = [120.30, 32.60, 121.40, 33.40];
  db.prepare(`INSERT OR REPLACE INTO cases (id, title, question, aoi, data, processing, outputs,
              provenance, bbox, temporal, sensitivity, status, ownerUserId, geoCardId, runSpec,
              createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    CASE_ID,
    '东亚—澳大利亚迁飞区 · 湿地水面变化与优先地点评估',
    '迁徙水鸟依赖的一串湿地，哪些不可替代？水面在这十几年里变了多少？',
    '黄海—渤海沿海湿地（示意窗口）',
    j(recipe.requires || []),
    'NDWI 水面提取 + 水面变化 + PC1 优先分值（1% 规则）',
    j(['water_change_map', 'priority_sites', 'report']),
    'archival',
    j(bbox),
    j({ start: '2010-01-01', end: '2024-12-31' }),
    'public',
    'published',
    null,
    'geocard.case.eaaf-wetland-priority',
    j(null),
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
      j(['East Asia']), j([]), j([]), j([]), j(['eaaf', 'synthetic-sample']),
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
      'GeoNexus 案例库', 'node.eaaf', 'East Asia', '', 'CC-BY-4.0', 'policy.synthetic-demo', 1,
      j([]), j([]), j(['eaaf', 'synthetic-sample']), component.description, 'published',
      component.sensitivity, j(component.bbox), now, now);
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
  db.prepare(`INSERT OR REPLACE INTO case_recipes (id, caseId, recipeId, parentRecipeId, params,
              paramContract, deliverables, recipe, visibility, status, ownerUserId, createdAt, updatedAt)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    'crp-eaaf-wetland', CASE_ID, RECIPE_ID, null,
    j({ region: 'yellow-sea', baseline_year: 2010, target_year: 2024, ndwi_threshold: 0, pc1_threshold: 0.2 }),
    j(paramContract), j(deliverableSpecs), j(recipe), 'public', 'approved', null, now, now);

  // 交付物：路径指向 uploads/ 下的副本（受 ARTIFACT_ROOTS 保护）
  const runId = 'run-eaaf-sample';
  for (const item of DELIVERABLES) {
    const target = path.join(targetDir, item.name + path.extname(item.file));
    db.prepare(`INSERT OR REPLACE INTO deliverables (id, runId, caseId, stepId, name, role, mediaType,
                ref, path, sizeBytes, status, createdAt, updatedAt)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      `dlv-eaaf-${item.name}`, runId, CASE_ID, item.stepId, item.name, item.role, item.mediaType,
      item.ref, target, fs.statSync(target).size, 'ready', now, now);
  }

  // 几何：矢量化后的面与点（供 Cesium / MapLibre 直接渲染）
  for (const item of GEOMETRY) {
    const target = path.join(targetDir, item.name + '.geojson');
    db.prepare(`INSERT OR REPLACE INTO case_geometry (id, caseId, name, kind, path, properties, createdAt)
                VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
      `geo-eaaf-${item.name}`, CASE_ID, item.name, item.kind, target, j(item.properties), now);
  }

  const summary = {
    case: CASE_ID,
    recipe: RECIPE_ID,
    components: COMPONENTS.length,
    deliverables: DELIVERABLES.length,
    geometry: GEOMETRY.length,
    files_copied_to: targetDir,
    database: dbPath,
    synthetic: true,
    visibility_mode: OPEN_DEMO ? 'public（开放演示：受限点位已放开）' : 'restricted（默认：含受限点位，访客 404）'
  };
  db.close();
  console.log('已种入平台：');
  console.log(JSON.stringify(summary, null, 2));
  console.log('\n提示：全部为合成/示意数据，几何要素带 synthetic=true；');
  console.log('      受限点位在场时，访客看不到这个案例（管理员可见）。');
}

main();
