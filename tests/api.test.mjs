/** 后端自证：案例库 / 审批 / 配额 / 九大模块内容 / GeoCard 发布审核。
 *
 *  做法：起一个**假 SDK Registry**（可断言它收到了什么），再以隔离的 DATA_DIR 起平台服务，
 *  验证"发布走 SDK 审批流"整条链路 —— 平台只做提交与转发，状态权威在 SDK。 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const API_KEY = 'test-api-key';

// ── 假 SDK Registry ─────────────────────────────────────────────────────
const registry = {
  cards: new Map(),
  recipes: new Map(),
  requests: [],
  apiKeysSeen: [],
  /** 回到夹具基线：卡片清空，但方案目录要**重新种上**已批准的那一份。 */
  reset() {
    this.cards.clear(); this.requests.length = 0; this.apiKeysSeen.length = 0;
    this.seedRecipes();
  },
  seedRecipes() {
    const seed = fixtureRecipe();
    this.recipes.clear();
    this.recipes.set(seed.id, { recipe: seed, provider_url: 'http://node-a',
      registered_at: new Date().toISOString(), status: 'approved', review_note: null,
      submitted_by: null, review_history: [] });
    return seed;
  }
};

/** 一份「2 数据 + 1 算子 + 1 报告」的方案：就是验收里要 fork 的那一份。 */
function fixtureRecipe({ region = '蒙古', year = null, scope = 'reusable' } = {}) {
  return {
    recipe_version: '1.0',
    id: 'recipe://geonexus/sdg-15-3-1@1.0.0',
    name: 'SDG 15.3.1 土地退化评估',
    description: '2 数据 + 1 算子 + 1 报告',
    tags: ['sdg'],
    params: [
      { name: 'year', type: 'integer', required: year === null, minimum: 2015, maximum: 2024, scope, ...(year === null ? {} : { default: year }) },
      { name: 'region', type: 'enum', enum: ['蒙古', '墨西哥'], default: region },
      { name: 'baseline', type: 'integer', scope: 'fixed', default: 2015 }
    ],
    steps: [
      { id: 's1', kind: 'skill', uses: 'sdg-aoi', params: { region: '${params.region}' }, outputs: { aoi: '边界', mask: '掩膜' } },
      { id: 's2', kind: 'skill', uses: 'sdg-degrade', depends_on: ['s1'], params: { year: '${params.year}', baseline: '${params.baseline}' }, inputs: { mask: 'step://s1/mask' }, outputs: { degradation: '退化栅格', transition: '转移矩阵' } },
      { id: 's3', kind: 'skill', uses: 'sdg-report', depends_on: ['s2'], inputs: { degradation: 'step://s2/degradation' }, outputs: { report: '报告' } }
    ],
    entrypoint: 's1',
    // 方案声明的数据依赖：可见性继承要看的正是这些"承载内容"的组成项
    requires: ['geocard.packed.menggu', 'geocard.oge.lc08-l2'],
    outputs: [
      { name: 'degradation_map', from: 's2.degradation', role: 'data', media_type: 'image/tiff' },
      { name: 'report', from: 's3.report', role: 'knowledge', media_type: 'text/html' }
    ]
  };
}

/** 假 GeoNode：只实现 geo.plan（物化），用来验证"平台不自己排 DAG"。 */
const fakeNode = { planCalls: [], reset() { this.planCalls.length = 0; } };

function startFakeNode() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      const json = (status, payload) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(payload)); };
      if (url.pathname === '/capabilities') {
        return json(200, { protocol: 'geomcp', methods: ['geo.capabilities', 'geo.describe', 'geo.execute', 'geo.plan', 'geo.health'],
          recipe_planning: { enabled: true, method: 'geo.plan', read_only: true, recipes: registry.recipes.size } });
      }
      if (url.pathname !== '/geomcp') return json(404, { detail: 'not found' });
      const body = raw ? JSON.parse(raw) : {};
      if (body.method !== 'geo.plan') return json(200, { jsonrpc: '2.0', id: body.id, error: { code: -32601, message: 'not found' } });
      fakeNode.planCalls.push(body.params);
      const address = body.params?.recipe || '';
      const entry = registry.recipes.get(address)
        || [...registry.recipes.values()].find((e) => e.recipe.id.startsWith(address));
      if (!entry) return json(200, { jsonrpc: '2.0', id: body.id, error: { code: 2005, message: `Recipe not found: ${address}`, data: { recipe: address } } });
      const recipe = entry.recipe;
      const params = {
        ...Object.fromEntries(recipe.params.filter((sp) => sp.default !== undefined).map((sp) => [sp.name, sp.default])),
        ...(body.params.params || {})
      };
      // 参数契约由"SDK 侧"判定：平台不该复制这套规则，只该翻译 field/code。
      for (const spec of recipe.params) {
        const value = params[spec.name];
        if (spec.required && (value === undefined || value === null)) {
          const message = `required parameter '${spec.name}' is missing`;
          return json(200, { jsonrpc: '2.0', id: body.id, error: { code: 2006, message, data: { field: spec.name, code: 'param_missing', message } } });
        }
        if (spec.minimum !== undefined && value !== undefined && Number(value) < spec.minimum) {
          const message = `param '${spec.name}' must be >= ${spec.minimum}, got ${value}`;
          return json(200, { jsonrpc: '2.0', id: body.id, error: { code: 2006, message, data: { field: spec.name, code: 'param_out_of_range', message } } });
        }
      }
      const runId = body.params.run_id || 'run';
      // 替换规则与 SDK 一致：整串是占位符时保留原始类型，否则按文本插值。
      const substitute = (value) => {
        if (typeof value === 'string') {
          const whole = /^\$\{\s*params\.([A-Za-z_]\w*)\s*\}$/.exec(value.trim());
          if (whole) return params[whole[1]];
          return value.replace(/\$\{\s*params\.([A-Za-z_]\w*)\s*\}/g, (_, name) => String(params[name] ?? ''));
        }
        if (Array.isArray(value)) return value.map(substitute);
        if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, substitute(v)]));
        return value;
      };
      const tasks = recipe.steps.map((step) => ({
        task_id: `${runId}:${step.id}`, step: step.id, kind: step.kind, uses: step.uses,
        depends_on: (step.depends_on || []).map((d) => `${runId}:${d}`),
        params: substitute(step.params || {}), inputs: step.inputs || {}, outputs: step.outputs || {}
      }));
      const deliverables = Object.fromEntries(recipe.outputs.map((o) => [o.name, { from: o.from, role: o.role, media_type: o.media_type }]));
      return json(200, { jsonrpc: '2.0', id: body.id, result: {
        recipe, recipe_id: recipe.id, run_id: runId, params,
        reusable_params: recipe.params.filter((sp) => sp.scope !== 'fixed').map((sp) => sp.name),
        fixed_params: recipe.params.filter((sp) => sp.scope === 'fixed').map((sp) => sp.name),
        tasks, deliverables
      } });
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port })));
}

function startFakeRegistry(port = 0) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      const body = raw ? JSON.parse(raw) : null;
      registry.requests.push({ method: req.method, path: url.pathname, query: url.search, body, apiKey: req.headers['x-api-key'] });
      const json = (status, payload) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(payload)); };

      if (url.pathname === '/health') return json(200, { status: 'ok' });
      if (req.method === 'GET' && url.pathname === '/cards') {
        const want = url.searchParams.get('status') || 'approved';
        const rows = [...registry.cards.values()].filter((e) => want === 'all' || e.status === want);
        return json(200, { count: rows.length, cards: rows });
      }
      if (req.method === 'POST' && url.pathname === '/cards') {
        if (req.headers['x-api-key'] !== API_KEY) return json(401, { detail: 'Missing or invalid X-API-Key' });
        const card = body?.card;
        if (!card?.id) return json(422, { detail: 'Body must contain card' });
        if (String(card.id).startsWith('bad-')) return json(422, { detail: { schema_errors: ['id 不合规范（测试注入）'] } });
        if (registry.cards.has(card.id)) return json(409, { detail: `Card already registered: ${card.id}` });
        const entry = { card, node_url: body.node_url || 'unknown', registered_at: new Date().toISOString(),
          status: body.status || 'approved', review_note: null, review_history: [], submitted_by: null };
        registry.cards.set(card.id, entry);
        return json(201, { status: 'registered', id: card.id, entry });
      }
      const decide = url.pathname.match(/^\/cards\/([^/]+)\/(approve|reject)$/);
      if (req.method === 'POST' && decide) {
        if (req.headers['x-api-key'] !== API_KEY) return json(401, { detail: 'Missing or invalid X-API-Key' });
        registry.apiKeysSeen.push(req.headers['x-api-key']);
        const entry = registry.cards.get(decodeURIComponent(decide[1]));
        if (!entry) return json(404, { detail: 'Card not registered' });
        entry.status = decide[2] === 'approve' ? 'approved' : 'rejected';
        entry.review_note = body?.note || null;
        entry.review_history.push({ at: new Date().toISOString(), action: decide[2], by: body?.by || null });
        return json(200, { status: entry.status, id: entry.card.id, entry });
      }

      // ── 方案目录（V1.1）─────────────────────────────────────────────
      if (req.method === 'GET' && url.pathname === '/recipes') {
        const want = url.searchParams.get('status');
        const approvedOnly = url.searchParams.get('approved_only') === 'true';
        const param = url.searchParams.get('param');
        const role = url.searchParams.get('role');
        const rows = [...registry.recipes.values()].filter((e) => {
          if (approvedOnly && e.status !== 'approved') return false;
          if (want && want !== 'all' && e.status !== want) return false;
          if (param && !e.recipe.params.some((p2) => p2.name === param)) return false;
          if (role && !e.recipe.outputs.some((o) => o.role === role)) return false;
          return true;
        });
        return json(200, { count: rows.length, recipes: rows.map((e) => ({
          id: e.recipe.id, name: e.recipe.name, description: e.recipe.description,
          version: e.recipe.id.split('@')[1] || null, status: e.status, provider_url: e.provider_url,
          steps: e.recipe.steps.length, params: e.recipe.params.map((p2) => p2.name),
          reusable_params: e.recipe.params.filter((p2) => p2.scope !== 'fixed').map((p2) => p2.name),
          outputs: e.recipe.outputs.map((o) => o.name), tags: e.recipe.tags || [], license: null,
          created_at: e.registered_at
        })) });
      }
      if (req.method === 'POST' && url.pathname === '/recipes') {
        if (req.headers['x-api-key'] !== API_KEY) return json(401, { detail: 'Missing or invalid X-API-Key' });
        const recipe = body?.recipe;
        if (!recipe?.id) return json(422, { detail: 'Body must contain recipe' });
        if (registry.recipes.has(recipe.id) && !body?.replace) return json(409, { detail: `Recipe already registered: ${recipe.id}` });
        const entry = { recipe, provider_url: body.provider_url || 'unknown', registered_at: new Date().toISOString(),
          status: body.status || 'pending', review_note: null, submitted_by: body.submitted_by || null,
          review_history: [{ at: new Date().toISOString(), action: 'registered', by: body.submitted_by || null, note: null }] };
        registry.recipes.set(recipe.id, entry);
        return json(201, { status: 'registered', id: recipe.id, entry });
      }
      const recipeDecide = url.pathname.match(/^\/recipes\/(.+)\/(approve|reject)$/);
      if (req.method === 'POST' && recipeDecide) {
        if (req.headers['x-api-key'] !== API_KEY) return json(401, { detail: 'Missing or invalid X-API-Key' });
        const address = decodeURIComponent(recipeDecide[1]);
        const entry = registry.recipes.get(address)
          || [...registry.recipes.values()].find((e) => e.recipe.id.startsWith(address));
        if (!entry) return json(404, { detail: `Recipe not registered: ${address}` });
        entry.status = recipeDecide[2] === 'approve' ? 'approved' : 'rejected';
        entry.review_note = body?.note || null;
        entry.review_history.push({ at: new Date().toISOString(), action: recipeDecide[2], by: body?.by || null });
        return json(200, { status: entry.status, id: entry.recipe.id, entry });
      }
      if (req.method === 'POST' && url.pathname === '/recipes/fork') {
        if (req.headers['x-api-key'] !== API_KEY) return json(401, { detail: 'Missing or invalid X-API-Key' });
        const source = [...registry.recipes.values()].find((e) => e.recipe.id.startsWith(body?.recipe_id));
        if (!source) return json(404, { detail: `Recipe not registered: ${body?.recipe_id}` });
        const known = new Set(source.recipe.params.map((p2) => p2.name));
        const unknown = Object.keys({ ...(body.params || {}), ...(body.fixed || {}) }).filter((k) => !known.has(k));
        if (unknown.length) return json(422, { detail: `cannot fork: unknown parameter(s) ${unknown.join(', ')}` });
        const version = body.version || '1.0.0';
        const forked = JSON.parse(JSON.stringify(source.recipe));
        forked.id = `recipe://${body.namespace || 'geonexus'}/${body.name || `${source.recipe.id.split('/')[3].split('@')[0]}-fork`}@${version}`;
        if (body.title) forked.name = body.title;
        forked.params = forked.params.map((sp) => {
          if (body.params && sp.name in body.params) sp.default = body.params[sp.name];
          if (body.fixed && sp.name in body.fixed) { sp.scope = 'fixed'; sp.default = body.fixed[sp.name]; }
          if (sp.default !== undefined) delete sp.required;
          return sp;
        });
        const entry = { recipe: forked, provider_url: body.provider_url || 'unknown',
          registered_at: new Date().toISOString(), status: body.register === false ? 'approved' : 'pending',
          review_note: `forked from ${source.recipe.id}`, submitted_by: null, review_history: [] };
        if (body.register !== false) registry.recipes.set(forked.id, entry);
        return json(201, { status: 'forked', from: body.recipe_id, id: forked.id, recipe: forked, entry });
      }
      const recipeGet = url.pathname.match(/^\/recipes\/(.+)$/);
      if (req.method === 'GET' && recipeGet) {
        const address = decodeURIComponent(recipeGet[1]);
        const entry = registry.recipes.get(address)
          || [...registry.recipes.values()].find((e) => e.recipe.id.startsWith(address) && e.status === 'approved')
          || [...registry.recipes.values()].find((e) => e.recipe.id.startsWith(address));
        if (!entry) return json(404, { detail: `Recipe not registered: ${address}` });
        return json(200, { entry, summary: { id: entry.recipe.id, name: entry.recipe.name, status: entry.status,
          params: entry.recipe.params.map((p2) => p2.name),
          reusable_params: entry.recipe.params.filter((p2) => p2.scope !== 'fixed').map((p2) => p2.name),
          outputs: entry.recipe.outputs.map((o) => o.name), steps: entry.recipe.steps.length } });
      }
      return json(404, { detail: 'not found' });
    });
  });
  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

// ── 假 SDK Web BFF（8900 的角色）：唯一带 task_id 的入口 ─────────────────
const sdkWeb = { loginCalls: 0, executeBodies: [], cancels: [], taskPolls: 0, failExecute: false };
/** 方案运行的每一步都是独立任务，所以这里按 skill 生成任务，而不是共用一个 id。 */
const recipeTasks = new Map();
let recipeTaskSeq = 0;
const isRecipeStep = (skill) => String(skill || '').startsWith('sdg-');

function startFakeSdkWeb() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      const body = raw ? JSON.parse(raw) : null;
      const json = (status, payload) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(payload)); };

      if (url.pathname === '/api/auth/login') {
        sdkWeb.loginCalls += 1;
        if (body?.username !== 'admin' || body?.password !== 'admin') return json(401, { detail: 'bad credentials' });
        return json(200, { token: 'fake-svc-jwt', token_type: 'bearer', expires_in: 3600, subject: 'admin' });
      }
      if (url.pathname === '/api/execute') {
        if (!req.headers.authorization?.startsWith('Bearer ')) return json(401, { detail: 'Missing token' });
        sdkWeb.executeBodies.push(body);
        sdkWeb.lastSkill = body?.skill;
        if (sdkWeb.failExecute) return json(500, { detail: 'node unreachable' });
        if (isRecipeStep(body?.skill)) {
          // 每步一个任务；第一次轮询 running，之后 done 并带上这一步的产物。
          const taskId = `task-step-${++recipeTaskSeq}`;
          recipeTasks.set(taskId, { skill: body.skill, params: body.params || {}, polls: 0 });
          return json(202, { task_id: taskId, status: 'queued' });
        }
        return json(202, { task_id: 'task-abc123', status: 'queued' });
      }
      const stepTask = url.pathname.match(/^\/api\/tasks\/(task-step-\d+)(\/cancel)?$/);
      if (stepTask) {
        const taskId = stepTask[1];
        const state = recipeTasks.get(taskId);
        if (!state) return json(404, { detail: 'unknown task' });
        if (stepTask[2]) {
          sdkWeb.cancels.push(true);
          return json(200, { id: taskId, status: 'cancelled' });
        }
        state.polls += 1;
        if (state.polls === 1) {
          return json(200, { id: taskId, status: 'running', progress: 0.5, message: 'computing', error: null });
        }
        const dir = sdkWeb.artifactDir;
        const outputs = {
          'sdg-aoi': { aoi: `${dir}/aoi.geojson`, mask: `${dir}/mask.tif` },
          'sdg-degrade': { degradation: `${dir}/degradation.tif`, transition: `${dir}/transition.csv` },
          'sdg-report': { report: `${dir}/report.html` }
        }[state.skill] || {};
        return json(200, { id: taskId, status: 'done', progress: 1, message: 'ok', error: null,
          result: { status: 'ok', skill: state.skill, outputs } });
      }
      if (url.pathname === '/api/tasks/task-abc123') {
        sdkWeb.taskPolls += 1;
        // 第一次返回 running，之后返回 done 并带产物（验证状态流转与产物落库）
        if (sdkWeb.taskPolls === 1) {
          return json(200, { id: 'task-abc123', status: 'running', progress: 0.5, message: 'computing', error: null });
        }
        const outside = sdkWeb.lastSkill === 'evil-skill';
        return json(200, { id: 'task-abc123', status: 'done', progress: 1, message: 'ok',
          error: null, result: { status: 'ok', skill: sdkWeb.lastSkill,
            outputs: outside
              ? { ndvi_raster: '/etc/hosts' }                      // 白名单之外，平台必须拒绝
              : { ndvi_raster: `${sdkWeb.artifactDir}/ndvi.tif`, stats: { mean: 0.42 } } } });
      }
      if (url.pathname === '/api/tasks/task-abc123/cancel') {
        sdkWeb.cancels.push(true);
        return json(200, { id: 'task-abc123', status: 'cancelled' });
      }
      if (url.pathname === '/api/health') return json(200, { status: 'ok', service: 'geonexus-web' });
      return json(404, { detail: 'not found' });
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port })));
}

// ── 平台服务（隔离 DATA_DIR）─────────────────────────────────────────────
let platform; let base; let tmpDir;
const spawned = [];   // 所有被拉起的平台进程，after 里统一 kill，避免失败时留孤儿进程

function startPlatform({ registryUrl, adminEmails, sdkWebUrl, artifactRoots, jwksUrl, nodeUrl }) {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gnx-test-'));
  const env = { ...process.env, PORT: String(3200 + Math.floor(Math.random() * 300)),
    DATA_DIR: tmpDir, UPLOADS_DIR: path.join(tmpDir, 'uploads'),
    REGISTRY_URL: registryUrl, SDK_REGISTRY_API_KEY: API_KEY, ADMIN_EMAILS: adminEmails,
    SDK_WEB_URL: sdkWebUrl, SDK_WEB_USER: 'admin', SDK_WEB_PASSWORD: 'admin',
    // 单技能复跑仍打默认节点（既有用例断言了这个 node_url）；方案运行则显式传 nodeUrl
    SDK_NODE_URL: 'http://127.0.0.1:8787',
    ARTIFACT_ROOTS: `${artifactRoots}:${path.join(tmpDir, 'uploads')}`,
    // 测试要直接验证本进程的会话认证与治理面：把身份代理关掉（生产默认是代理到 Java）
    IDENTITY_BASE_URL: '',
    ...(jwksUrl ? { IDENTITY_JWKS_URL: jwksUrl } : {}) };
  const child = spawn(process.execPath, ['server.js'], { cwd: ROOT, env });
  spawned.push(child);
  return new Promise((resolve, reject) => {
    let out = '';
    const timer = setTimeout(() => reject(new Error(`平台服务未在 15s 内就绪：${out}`)), 15000);
    child.stdout.on('data', (d) => {
      out += d.toString();
      const m = out.match(/running at http:\/\/localhost:(\d+)/);
      if (m) { clearTimeout(timer); resolve({ child, port: Number(m[1]), dataDir: tmpDir }); }
    });
    child.stderr.on('data', (d) => { out += d.toString(); });
    child.on('exit', (code) => { if (code) reject(new Error(`平台服务退出 code=${code}: ${out}`)); });
  });
}

const { DatabaseSync } = await import('node:sqlite');

/** 测试用提权：直接改测试自己拥有的 SQLite（不是生产后门——register 已不采信 roles/scopes）。 */
function grant(email, roles, scopes, dataDir) {
  const db = new DatabaseSync(path.join(dataDir, 'geonexus.db'));
  db.prepare('UPDATE users SET roles = ?, scopes = ? WHERE email = ?')
    .run(JSON.stringify(roles), JSON.stringify(scopes), String(email).toLowerCase());
  db.close();
}

async function api(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(`${base}${path}`, {
    signal: AbortSignal.timeout(10000),   // 挂死的请求要失败，而不是拖住整轮测试
    method,
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let data = null; try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  return { status: res.status, data };
}

let adminToken; let publicToken;

before(async () => {
  const fake = await startFakeRegistry();
  const fakeWeb = await startFakeSdkWeb();
  const fakeNodeSrv = await startFakeNode();
  const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), 'gnx-artifacts-'));
  fs.writeFileSync(path.join(artifacts, 'ndvi.tif'), 'GEOTIFF-PLACEHOLDER');
  // 方案运行的每步产物：报告是一份真的 HTML，交付物接口要能把它读出来。
  fs.writeFileSync(path.join(artifacts, 'report.html'), '<html><body><h1>SDG 15.3.1</h1></body></html>');
  fs.writeFileSync(path.join(artifacts, 'degradation.tif'), 'GEOTIFF-PLACEHOLDER');
  fs.writeFileSync(path.join(artifacts, 'transition.csv'), 'from,to,area\n');
  fs.writeFileSync(path.join(artifacts, 'aoi.geojson'), '{"type":"FeatureCollection","features":[]}');
  fs.writeFileSync(path.join(artifacts, 'mask.tif'), 'GEOTIFF-PLACEHOLDER');
  sdkWeb.artifactDir = artifacts;
  // 目录里先放一份**已批准**的方案：这是"可以被复用的知识产品"。
  registry.seedRecipes();
  platform = await startPlatform({ registryUrl: `http://127.0.0.1:${fake.port}`, adminEmails: 'admin@test.local',
    sdkWebUrl: `http://127.0.0.1:${fakeWeb.port}`, artifactRoots: artifacts,
    nodeUrl: `http://127.0.0.1:${fakeNodeSrv.port}`,
    jwksUrl: 'http://127.0.0.1:1/.well-known/jwks.json' });   // 故意指向不可达地址：会话令牌路径不受影响
  base = `http://127.0.0.1:${platform.port}`;
  // 管理员与公众账号各一
  const a = await api('/api/auth/register', { method: 'POST', body: { name: '管理员', email: 'admin@test.local', password: 'pw-admin-123' } });
  adminToken = a.data.token;
  const u = await api('/api/auth/register', { method: 'POST', body: { name: '公众用户', email: 'public@test.local', password: 'pw-public-123' } });
  publicToken = u.data.token;
  platform.registryServer = fake.server;
  platform.webServer = fakeWeb.server;
  platform.nodeServer = fakeNodeSrv.server;
});

after(() => {
  for (const c of spawned) { try { c.kill() } catch { /* 已退出 */ } }
  platform?.child?.kill();
  platform?.registryServer?.close();
  platform?.webServer?.close();
  platform?.nodeServer?.close();
  if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ── 身份与角色 ───────────────────────────────────────────────────────────
test('健康检查', async () => {
  const r = await api('/api/health');
  assert.equal(r.status, 200);
});

test('公众自助注册只拿到"能看"的 scopes', async () => {
  const r = await api('/api/auth/me', { token: publicToken });
  assert.equal(r.status, 200);
  assert.deepEqual(r.data.user.roles, ['public_visitor']);
  assert.ok(r.data.user.scopes.includes('card:read'));
  assert.ok(!r.data.user.scopes.includes('workbench:run'));
  assert.equal(r.data.user.isAdmin, false);
});

test('ADMIN_EMAILS 引导的管理员拿到 platform_admin 与 *', async () => {
  const r = await api('/api/auth/me', { token: adminToken });
  assert.equal(r.data.user.isAdmin, true);
  assert.ok(r.data.user.roles.includes('platform_admin'));
  assert.deepEqual(r.data.user.scopes, ['*']);
});

test('公众账号访问管理端被拒（403），未登录被拒（401）', async () => {
  assert.equal((await api('/api/admin/overview', { token: publicToken })).status, 403);
  assert.equal((await api('/api/admin/overview')).status, 401);
  assert.equal((await api('/api/sdk/geocards?status=all', { token: publicToken })).status, 403);
});

// ── 案例库 ───────────────────────────────────────────────────────────────
test('案例：创建 → 列表 → 发布 → /api/sdk/cases 只出已发布', async () => {
  const create = await api('/api/cases', { method: 'POST', token: adminToken,
    body: { title: '亚马逊植被变化', question: '十年变化？', aoi: 'Amazon', data: ['s2-2015', 's2-2025'], provenance: 'live', status: 'draft' } });
  assert.equal(create.status, 201);
  const id = create.data.item.id;

  const all = await api('/api/cases');
  assert.ok(all.data.items.some((c) => c.id === id));
  assert.equal((await api('/api/sdk/cases')).data.count, 0, '草稿不应出现在可复现案例里');

  const pub = await api(`/api/cases/${id}`, { method: 'PUT', token: adminToken, body: { title: '亚马逊植被变化', status: 'published' } });
  assert.equal(pub.data.item.status, 'published');
  const sdkCases = await api('/api/sdk/cases');
  assert.equal(sdkCases.data.count, 1);
  assert.equal(sdkCases.data.items[0].id, id);

  assert.equal((await api(`/api/cases/${id}`, { method: 'DELETE', token: adminToken })).status, 200);
  assert.equal((await api('/api/cases')).data.count, 0);
});

test('案例：未登录不能创建', async () => {
  assert.equal((await api('/api/cases', { method: 'POST', body: { title: 'x' } })).status, 401);
});

// ── 配额 ─────────────────────────────────────────────────────────────────
test('配额：设置 → 扣减 → 超额 409（两级取小）', async () => {
  assert.equal((await api('/api/quotas', { method: 'POST', token: adminToken,
    body: { scope: 'dept', subject: 'dept-a', limit: 10, unit: 'core-hour' } })).status, 201);
  assert.equal((await api('/api/quotas', { method: 'POST', token: adminToken,
    body: { scope: 'user', subject: 'public@test.local', limit: 4 } })).status, 201);

  const ok = await api('/api/quotas/consume', { method: 'POST', token: publicToken,
    body: { subject: 'public@test.local', dept: 'dept-a', amount: 3 } });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.consumed, 3);

  const over = await api('/api/quotas/consume', { method: 'POST', token: publicToken,
    body: { subject: 'public@test.local', dept: 'dept-a', amount: 2 } });
  assert.equal(over.status, 409, '个人上限 4，已用 3，再要 2 必须拒绝');
  assert.match(over.data.error, /配额不足/);

  const list = await api('/api/quotas', { token: adminToken });
  assert.equal(list.data.count, 2);
  assert.equal(list.data.items.find((q) => q.scope === 'user').remaining, 1);
});

// ── GeoCard 发布走 SDK 审批流 ────────────────────────────────────────────
const goodCard = { geocard_version: '0.1', id: 'test-card-1', type: 'data', name: '测试卡片',
  spatial: { bbox: [100, 20, 110, 30] }, access: { protocol: 'geomcp', endpoint: 'http://127.0.0.1:8787' },
  compliance: { sensitivity: 'public' }, provenance: { provider: '测试' } };

test('发布 GeoCard：进 SDK 审核队列（pending）并镜像成本地审批单', async () => {
  registry.reset();
  const r = await api('/api/sdk/geocards/publish', { method: 'POST', token: adminToken,
    body: { card: goodCard, nodeUrl: 'platform' } });
  assert.equal(r.status, 201);
  assert.equal(r.data.approval.kind, 'geocard-publish');
  assert.equal(r.data.approval.status, 'pending');
  assert.equal(r.data.approval.sdkState, 'pending');

  const reg = registry.requests.find((q) => q.method === 'POST' && q.path === '/cards');
  assert.ok(reg, 'SDK Registry 应收到 POST /cards');
  assert.equal(reg.body.status, 'pending', '发布必须进 SDK 审核队列，而不是直接 approved');
  assert.equal(reg.apiKey, API_KEY, 'X-API-Key 必须转发');
  assert.equal(registry.cards.get('test-card-1').status, 'pending');
});

test('SDK 契约校验失败（422）时不入审批队列', async () => {
  const bad = await api('/api/sdk/geocards/publish', { method: 'POST', token: adminToken,
    body: { card: { ...goodCard, id: 'bad-card' } } });
  assert.equal(bad.status, 422);
  const list = await api('/api/approvals', { token: adminToken });
  assert.equal(list.data.items.filter((a) => a.subjectId === 'bad-card').length, 0);
});

test('审批通过：决定转发给 SDK，SDK 变成 approved 且只出已批准卡片', async () => {
  const pending = await api('/api/approvals?status=pending', { token: adminToken });
  const target = pending.data.items.find((a) => a.subjectId === 'test-card-1');
  assert.ok(target);

  const decided = await api(`/api/approvals/${target.id}/decide`, { method: 'POST', token: adminToken,
    body: { decision: 'approve', note: '合规且可公开' } });
  assert.equal(decided.status, 200);
  assert.equal(decided.data.item.status, 'approved');
  assert.equal(decided.data.item.sdkState, 'approved');
  assert.equal(decided.data.item.decidedBy, 'admin@test.local');
  assert.equal(registry.cards.get('test-card-1').status, 'approved');
  assert.deepEqual(registry.apiKeysSeen, [API_KEY]);

  assert.equal((await api(`/api/approvals/${target.id}/decide`, { method: 'POST', token: adminToken,
    body: { decision: 'approve' } })).status, 409, '重复裁决必须 409');

  const cards = await api('/api/sdk/geocards');
  assert.equal(cards.data.count, 1);
  assert.equal(cards.data.items[0].id, 'test-card-1');
  assert.equal(cards.data.items[0].status, 'approved');
});

test('审批驳回：SDK 变 rejected，公开目录不再出现', async () => {
  await api('/api/sdk/geocards/publish', { method: 'POST', token: adminToken,
    body: { card: { ...goodCard, id: 'test-card-2' } } });
  const pending = await api('/api/approvals?status=pending', { token: adminToken });
  const t = pending.data.items.find((a) => a.subjectId === 'test-card-2');
  const r = await api(`/api/approvals/${t.id}/decide`, { method: 'POST', token: adminToken,
    body: { decision: 'reject', note: '含敏感信息' } });
  assert.equal(r.data.item.status, 'rejected');
  assert.equal(registry.cards.get('test-card-2').status, 'rejected');

  const cards = await api('/api/sdk/geocards');
  assert.equal(cards.data.count, 1, '被驳回的卡片不出现在公开目录');
  const allCards = await api('/api/sdk/geocards?status=all', { token: adminToken });
  assert.equal(allCards.data.count, 2, '管理员能看到全部状态');
  assert.equal((await api('/api/sdk/geocards?status=pending', { token: adminToken })).data.count, 0);
});

test('公众不能裁决审批单', async () => {
  const list = await api('/api/approvals', { token: adminToken });
  const any = list.data.items[0];
  assert.equal((await api(`/api/approvals/${any.id}/decide`, { method: 'POST', token: publicToken,
    body: { decision: 'approve' } })).status, 403);
});

// ── 九大模块内容管理 ─────────────────────────────────────────────────────
test('模块内容：未知模块 404；增删改查与九大模块清单', async () => {
  assert.equal((await api('/api/admin/modules/not-a-module/items', { token: adminToken })).status, 404);

  const modules = await api('/api/admin/modules', { token: adminToken });
  assert.equal(modules.data.modules.length, 9, '九大模块必须齐全');

  const created = await api('/api/admin/modules/global-cases/items', { method: 'POST', token: adminToken,
    body: { title: '亚马逊植被变化', summary: '十年对比', tag: 'SDG15', sortOrder: 1 } });
  assert.equal(created.status, 201);
  const itemId = created.data.item.id;

  const list = await api('/api/admin/modules/global-cases/items', { token: adminToken });
  assert.equal(list.data.count, 1);

  const updated = await api(`/api/admin/modules/global-cases/items/${itemId}`, { method: 'PUT', token: adminToken,
    body: { title: '亚马逊植被变化（修订）', visible: false } });
  assert.equal(updated.data.item.title, '亚马逊植被变化（修订）');
  assert.equal(updated.data.item.visible, false);

  assert.equal((await api(`/api/admin/modules/global-cases/items/${itemId}`, { method: 'DELETE', token: adminToken })).status, 200);
  assert.equal((await api('/api/admin/modules/global-cases/items', { token: adminToken })).data.count, 0);
});

test('公众不能管理模块内容', async () => {
  assert.equal((await api('/api/admin/modules/global-cases/items', { token: publicToken })).status, 403);
});

// ── 总览与审计 ───────────────────────────────────────────────────────────
test('管理总览包含计数与 SDK 状态；写操作留下审计', async () => {
  const r = await api('/api/admin/overview', { token: adminToken });
  assert.equal(r.status, 200);
  assert.equal(r.data.sdk.status, 'up');
  assert.equal(r.data.sdk.cards, 2);
  assert.ok(r.data.users >= 2);
  assert.ok(r.data.approvalsTotal >= 2);

  const audit = await api('/api/admin/audit?limit=50', { token: adminToken });
  const actions = audit.data.items.map((a) => a.action);
  for (const expected of ['approval.create', 'approval.approve', 'approval.reject', 'quota.set', 'module.item.create']) {
    assert.ok(actions.includes(expected), `审计缺少 ${expected}`);
  }
  assert.ok(audit.data.items.every((a) => a.at && a.action));
});

test('SDK 掉线时目录接口 503 且给出可操作提示（前端据此回退）', async () => {
  const dead = await api('/api/sdk/geocards');
  assert.equal(dead.status, 200, '注册中心在线时应正常返回');
  const registryPort = platform.registryServer.address().port;
  platform.registryServer.close();     // 断掉假注册中心
  const r = await api('/api/sdk/geocards');
  assert.equal(r.status, 503);
  assert.match(r.data.error, /连不上 SDK Registry/);
  assert.ok(r.data.hint);

  // 恢复注册中心：后续用例（方案目录等）依赖它在线。平台按 URL 直连，
  // 所以这里要起回同一个端口，才能让"掉线"只影响本用例。
  const revived = await startFakeRegistry(registryPort);
  platform.registryServer = revived.server;
});

// ── 案例「一键复跑」：接 SDK Web BFF（唯一带 task_id 的入口）───────────────
const runnableCase = {
  title: '亚马逊植被变化（可复跑）', question: '十年变化？', aoi: 'Amazon', provenance: 'live', status: 'published',
  data: ['s2-ndvi-2015', 's2-ndvi-2025'],
  runSpec: { skill: 'ndvi-analysis', params: { red: '/tmp/red.tif', nir: '/tmp/nir.tif' } }
};

test('复跑：把案例翻译成 SDK 执行请求，并落库 sdk_task_id', async () => {
  sdkWeb.executeBodies.length = 0; sdkWeb.taskPolls = 0;
  const created = await api('/api/cases', { method: 'POST', token: adminToken, body: runnableCase });
  const caseId = created.data.item.id;
  assert.equal(created.data.item.runSpec.skill, 'ndvi-analysis');

  const run = await api(`/api/cases/${caseId}/run`, { method: 'POST', token: adminToken });
  assert.equal(run.status, 202);
  assert.equal(run.data.run.sdkTaskId, 'task-abc123');
  assert.equal(run.data.run.status, 'queued');
  assert.equal(run.data.run.skill, 'ndvi-analysis');

  const sent = sdkWeb.executeBodies.at(-1);
  assert.equal(sent.skill, 'ndvi-analysis');
  assert.deepEqual(sent.params, { red: '/tmp/red.tif', nir: '/tmp/nir.tif' });
  assert.equal(sent.node_url, 'http://127.0.0.1:8787', '必须显式带 node_url');
  assert.equal(sent.geocards, undefined, '本机节点未注册卡片，绝不能带 geocards');
  assert.ok(sdkWeb.loginCalls >= 1, '应使用服务账号登录 SDK Web');

  // 状态流转：running → succeeded，并在终态落产物
  const running = await api(`/api/runs/${run.data.run.id}`, { token: adminToken });
  assert.equal(running.data.run.sdkStatus, 'running');
  assert.equal(running.data.run.progress, 0.5);

  const done = await api(`/api/runs/${run.data.run.id}`, { token: adminToken });
  assert.equal(done.data.run.status, 'succeeded', 'done 应投影为 GeoTask 的 succeeded');
  assert.equal(done.data.run.outputs.ndvi_raster.endsWith('ndvi.tif'), true);
  assert.ok(done.data.run.finishedAt);

  const list = await api(`/api/cases/${caseId}/runs`, { token: adminToken });
  assert.equal(list.data.count, 1);
});

test('复跑：产物可按名下载，且只允许白名单根目录内的路径', async () => {
  // 自足用例：不依赖别的测试留下的数据
  const created = await api('/api/cases', { method: 'POST', token: adminToken, body: runnableCase });
  const caseId = created.data.item.id;
  const run = await api(`/api/cases/${caseId}/run`, { method: 'POST', token: adminToken });
  await api(`/api/runs/${run.data.run.id}`, { token: adminToken });          // running
  const done = await api(`/api/runs/${run.data.run.id}`, { token: adminToken });  // succeeded + outputs
  assert.equal(done.data.run.status, 'succeeded');

  const ok = await fetch(`${base}/api/runs/${run.data.run.id}/artifacts/ndvi_raster`,
    { headers: { authorization: `Bearer ${adminToken}` } });
  const okBody = await ok.text();
  assert.equal(ok.status, 200, `下载失败：${ok.status} ${okBody}；outputs=${JSON.stringify(done.data.run.outputs)}`);

  // 越界产物必须 403：SDK 返回了白名单外的绝对路径
  const evil = await api('/api/cases', { method: 'POST', token: adminToken, body: {
    ...runnableCase, title: '越界产物案例', runSpec: { skill: 'evil-skill', params: {} } } });
  const evilRun = await api(`/api/cases/${evil.data.item.id}/run`, { method: 'POST', token: adminToken });
  await api(`/api/runs/${evilRun.data.run.id}`, { token: adminToken });
  const evilDone = await api(`/api/runs/${evilRun.data.run.id}`, { token: adminToken });
  assert.equal(evilDone.data.run.outputs.ndvi_raster, '/etc/hosts');

  const denied = await fetch(`${base}/api/runs/${evilRun.data.run.id}/artifacts/ndvi_raster`,
    { headers: { authorization: `Bearer ${adminToken}` } });
  assert.equal(denied.status, 403, '白名单之外的产物路径必须拒绝');
  assert.match((await denied.json()).error, /ARTIFACT_ROOTS/);

  // 未登录不得下载
  assert.equal((await fetch(`${base}/api/runs/${run.data.run.id}/artifacts/ndvi_raster`)).status, 401);
});

test('复跑：未发布 409、缺 runSpec 422、未登录 401', async () => {
  const draft = await api('/api/cases', { method: 'POST', token: adminToken,
    body: { title: '草稿', status: 'draft', runSpec: { skill: 'ndvi-analysis', params: {} } } });
  assert.equal((await api(`/api/cases/${draft.data.item.id}/run`, { method: 'POST', token: adminToken })).status, 409);

  const noSpec = await api('/api/cases', { method: 'POST', token: adminToken, body: { title: '无复跑声明', status: 'published' } });
  const r = await api(`/api/cases/${noSpec.data.item.id}/run`, { method: 'POST', token: adminToken });
  assert.equal(r.status, 422);
  assert.match(r.data.error, /runSpec/);

  assert.equal((await api(`/api/cases/${draft.data.item.id}/run`, { method: 'POST' })).status, 401);
});

test('复跑：取消转发给 SDK', async () => {
  sdkWeb.cancels.length = 0;
  const created = await api('/api/cases', { method: 'POST', token: adminToken, body: runnableCase });
  const run = await api(`/api/cases/${created.data.item.id}/run`, { method: 'POST', token: adminToken });
  const cancelled = await api(`/api/runs/${run.data.run.id}/cancel`, { method: 'POST', token: adminToken });
  assert.equal(cancelled.status, 200);
  assert.equal(sdkWeb.cancels.length, 1);
});

test('复跑：SDK Web 提交失败返回 502 且不产生运行记录', async () => {
  const created = await api('/api/cases', { method: 'POST', token: adminToken, body: runnableCase });
  sdkWeb.failExecute = true;
  const failed = await api(`/api/cases/${created.data.item.id}/run`, { method: 'POST', token: adminToken });
  sdkWeb.failExecute = false;
  assert.equal(failed.status, 502);
  assert.match(failed.data.error, /提交 SDK 执行失败/);
  const runs = await api(`/api/cases/${created.data.item.id}/runs`, { token: adminToken });
  assert.equal(runs.data.count, 0, '提交失败不应留下假的运行记录');
});

// ── 身份迁 Java：Java 签发的 RS256 JWT 必须被业务面接受 ────────────────────
import crypto from 'node:crypto';

function startFakeJwks() {
  let { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  let jwk = publicKey.export({ format: 'jwk' });
  let kid = 'test-kid-1';
  const b64 = (buf) => Buffer.from(buf).toString('base64url');
  const sign = (payload, { alg = 'RS256', kidOverride = kid, key = privateKey, badSig = false } = {}) => {
    const header = b64(JSON.stringify({ alg, typ: 'JWT', kid: kidOverride }));
    const body = b64(JSON.stringify(payload));
    const sig = crypto.sign('RSA-SHA256', Buffer.from(`${header}.${body}`), key);
    return `${header}.${body}.${badSig ? b64(Buffer.from('tampered-signature')) : b64(sig)}`;
  };
  const server = http.createServer((req, res) => {
    if (req.url.startsWith('/.well-known/jwks.json')) {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ keys: [{ kty: 'RSA', use: 'sig', alg: 'RS256', kid, n: jwk.n, e: jwk.e }] }));
    }
    res.writeHead(404); res.end('{}');
  });
  let previousPrivateKey = null;
  const rotate = () => {   // 模拟 Java 侧重启/轮换密钥
    previousPrivateKey = privateKey;
    ({ publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }));
    jwk = publicKey.export({ format: 'jwk' });
    kid = `test-kid-${Date.now()}`;
    return kid;
  };
  return new Promise((resolve) => server.listen(0, '127.0.0.1',
    () => resolve({ server, port: server.address().port, sign, rotate,
      stalePrivateKey: () => previousPrivateKey,
      currentKid: () => kid })));
}

let jwks;
let javaToken;

test('身份迁 Java：JWKS 公钥验签通过后，Java 令牌在业务面同样有效', async () => {
  jwks = await startFakeJwks();
  const javaPlatform = await startPlatform({
    registryUrl: 'http://127.0.0.1:1', adminEmails: '', sdkWebUrl: 'http://127.0.0.1:1',
    artifactRoots: '/tmp', jwksUrl: `http://127.0.0.1:${jwks.port}/.well-known/jwks.json`
  });
  const jbase = `http://127.0.0.1:${javaPlatform.port}`;
  // 等 JWKS 首次拉取完成
  await new Promise((r) => setTimeout(r, 400));

  const claims = {
    sub: '4001', userId: 4001, userName: 'admin', nickName: '平台管理员', deptId: 1000,
    tenant: 'GeoNexus', accountType: 'staff', roles: ['platform_admin'], scopes: ['*'],
    iss: 'geonexus-platform', jti: 'jti-1',
    iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 600
  };
  javaToken = jwks.sign(claims);

  const ok = await fetch(`${jbase}/api/cases`, { headers: { authorization: `Bearer ${javaToken}` } });
  assert.equal(ok.status, 200, 'Java 令牌应被业务面接受');

  // admin 判定来自 claim：能进管理端
  const admin = await fetch(`${jbase}/api/admin/overview`, { headers: { authorization: `Bearer ${javaToken}` } });
  assert.equal(admin.status, 200);

  // 负例都打在**需要鉴权**的端点上（/api/cases 是公开读取，不适合验证 401）
  const adminOnly = `${jbase}/api/admin/overview`;
  assert.equal((await fetch(adminOnly, { headers: { authorization: `Bearer ${javaToken}` } })).status, 200);

  const tampered = jwks.sign(claims, { badSig: true });
  assert.equal((await fetch(adminOnly, { headers: { authorization: `Bearer ${tampered}` } })).status, 401, '篡改签名必须 401');

  const expired = jwks.sign({ ...claims, exp: Math.floor(Date.now() / 1000) - 60 });
  assert.equal((await fetch(adminOnly, { headers: { authorization: `Bearer ${expired}` } })).status, 401, '过期令牌必须 401');

  const unknownKid = jwks.sign(claims, { kidOverride: 'rotated-key' });
  assert.equal((await fetch(adminOnly, { headers: { authorization: `Bearer ${unknownKid}` } })).status, 401, '未知 kid 必须 401');

  const hs = jwks.sign(claims, { alg: 'HS256' });
  assert.equal((await fetch(adminOnly, { headers: { authorization: `Bearer ${hs}` } })).status, 401, '不允许 alg 降级');

  // claim 即权限：Java 侧签成公众 scope 时，同一个端点必须 403 而不是 401
  const publicClaims = jwks.sign({ ...claims, jti: 'jti-2', roles: ['public_visitor'],
    scopes: ['earth:view', 'card:read', 'case:read'] });
  assert.equal((await fetch(adminOnly, { headers: { authorization: `Bearer ${publicClaims}` } })).status, 403,
    '有效令牌但权限不足 → 403');

  jwks.server.close();
  javaPlatform.child.kill();
});

test('身份迁 Java：公钥轮换后，BFF 会自动重取 JWKS 并接受新 kid 的令牌', async () => {
  const jwks2 = await startFakeJwks();
  const p2 = await startPlatform({ registryUrl: 'http://127.0.0.1:1', adminEmails: '',
    sdkWebUrl: 'http://127.0.0.1:1', artifactRoots: '/tmp',
    jwksUrl: `http://127.0.0.1:${jwks2.port}/.well-known/jwks.json` });
  const b2 = `http://127.0.0.1:${p2.port}`;
  const claimsFor = () => ({ sub: '4001', userId: 4001, userName: 'admin', nickName: '管理员', roles: ['platform_admin'],
    scopes: ['*'], iss: 'geonexus-platform', jti: 'jti-rot',
    iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 600 });

  try {
    await new Promise((r) => setTimeout(r, 400));
    const before = jwks2.sign(claimsFor());
    assert.equal((await fetch(`${b2}/api/admin/overview`, { headers: { authorization: `Bearer ${before}` } })).status, 200);

    const newKid = jwks2.rotate();                       // Java 侧换密钥
    const after = jwks2.sign(claimsFor());               // 用新私钥签，kid 也变了
    // 前置刷新：遇到未知 kid 时先补公钥再判定，因此**首次请求就应成功**（轮换对用户透明）。
    // 早期实现是"先拒绝再后台重取"，会让前端在 Java 重启后莫名被登出——已修。
    const first = await fetch(`${b2}/api/admin/overview`, { headers: { authorization: `Bearer ${after}` } });
    assert.equal(first.status, 200, `新 kid=${newKid} 的令牌应被直接接受（前置刷新）`);

    // 旧 kid 的令牌（旧私钥签）在轮换后必须被拒：公钥已换，签名验不过
    const stale = jwks2.sign(claimsFor(), { key: jwks2.stalePrivateKey() });
    assert.equal((await fetch(`${b2}/api/admin/overview`, { headers: { authorization: `Bearer ${stale}` } })).status, 401);
  } finally {
    jwks2.server.close();
    p2.child.kill();
  }
});

// ── 权限收紧：审批与配额不是"登录就能看" ────────────────────────────────
async function makeUser(email, roles, scopes) {
  const r = await api('/api/auth/register', { method: 'POST',
    body: { name: email.split('@')[0], email, password: 'pw-1234567890' } });
  if (roles) grant(email, roles, scopes, platform.dataDir);
  const t = r.data.token;
  // 提权后重新登录，让令牌里的 claims 反映新角色
  if (roles) return (await api('/api/auth/login', { method: 'POST', body: { email, password: 'pw-1234567890' } })).data.token;
  return t;
}

test('审批列表需要 approval:list：公众 403，有该 scope 的角色 200', async () => {
  const operatorT = await makeUser('op@test.local', ['platform_operator'], ['approval:list', 'quota:read']);
  const memberT = await makeUser('mem@test.local', ['org_member'], ['earth:view', 'card:read']);
  const visitorT = await makeUser('vis@test.local', null, null);   // 默认公众访客

  assert.equal((await api('/api/approvals', { token: adminToken })).status, 200);
  assert.equal((await api('/api/approvals', { token: operatorT })).status, 200, '平台运营有 approval:list');
  assert.equal((await api('/api/approvals', { token: memberT })).status, 403);
  assert.equal((await api('/api/approvals', { token: visitorT })).status, 403, '公众访客不得看全量审批');
  assert.equal((await api('/api/approvals')).status, 401, '未登录 401');

  // 自己的申请：登录即可看，且只包含自己提交的
  assert.equal((await api('/api/approvals/mine', { token: visitorT })).status, 200);
});

test('配额：无 quota:read 只能看自己的；不能替别人扣减', async () => {
  const memberEmail = 'quota-member@test.local';
  const memberT = await makeUser(memberEmail, ['org_member'], ['earth:view', 'card:read']);

  await api('/api/quotas', { method: 'POST', token: adminToken, body: { scope: 'dept', subject: 'dept-x', limit: 100 } });
  await api('/api/quotas', { method: 'POST', token: adminToken, body: { scope: 'user', subject: memberEmail, limit: 20 } });

  const all = await api('/api/quotas', { token: adminToken });
  assert.equal(all.data.all, true);
  assert.ok(all.data.count >= 2);

  const own = await api('/api/quotas', { token: memberT });
  assert.equal(own.data.all, false, '无 quota:read → 只返回自己的');
  assert.ok(own.data.items.every((q) => q.scope === 'user' && q.subject === memberEmail));

  assert.equal((await api('/api/quotas/consume', { method: 'POST', token: memberT,
    body: { subject: 'someone-else@x', dept: 'dept-x', amount: 1 } })).status, 403, '不能替别人扣减');
  assert.equal((await api('/api/quotas/consume', { method: 'POST', token: memberT,
    body: { subject: memberEmail, amount: 3 } })).status, 200);
});

test('自助注册不能提权：请求体里的 roles/scopes 被忽略', async () => {
  const r = await api('/api/auth/register', { method: 'POST', body: {
    name: '想当管理员的人', email: 'escalate@test.local', password: 'pw-1234567890',
    roles: ['platform_admin'], scopes: ['*'] } });
  assert.equal(r.status, 201);
  assert.deepEqual(r.data.user.roles, ['public_visitor'], '角色必须由服务端赋默认值');
  assert.ok(!r.data.user.scopes.includes('*'));
  assert.equal(r.data.user.isAdmin, false);
  assert.equal((await api('/api/admin/overview', { token: r.data.token })).status, 403, '拿不到管理端');
});

// ── 地图设置：默认 3D 地球，后台可配、公开可读 ───────────────────────────
test('地图设置：默认 Cesium 3D 地球，公开可读', async () => {
  const r = await api('/api/settings');
  assert.equal(r.status, 200, '未登录也能读（前端要知道用哪个引擎）');
  assert.equal(r.data['map.engine'], 'cesium', '默认 3D 地球');
  assert.equal(r.data['map.projection'], '3d');
  assert.equal(r.data['map.showGeoCards'], true);
  assert.ok(r.data['map.homeView'].height > 0);
});

test('地图设置：只有管理员能改，且校验取值', async () => {
  const memberT = await makeUser('cfg@test.local', ['org_member'], ['earth:view', 'card:read']);
  // 非管理员不可写
  assert.equal((await api('/api/settings', { method: 'PUT', token: memberT, body: { 'map.engine': 'maplibre' } })).status, 403);
  assert.equal((await api('/api/settings', { method: 'PUT', body: { 'map.engine': 'maplibre' } })).status, 401);

  // 非法值 422
  assert.equal((await api('/api/settings', { method: 'PUT', token: adminToken, body: { 'map.engine': 'three' } })).status, 422);
  assert.equal((await api('/api/settings', { method: 'PUT', token: adminToken, body: { 'map.projection': '4d' } })).status, 422);
  assert.equal((await api('/api/settings', { method: 'PUT', token: adminToken, body: { 'nope.key': 1 } })).status, 422);

  // 管理员改成 MapLibre 并写入，其它设置项保持不变
  const upd = await api('/api/settings', { method: 'PUT', token: adminToken, body: {
    'map.engine': 'maplibre', 'map.projection': '2d', 'map.basemap': 'dark-vector',
    'map.showGeoCards': false, 'map.homeView': { lon: 100, lat: 20, height: 15000000 } } });
  assert.equal(upd.status, 200);
  assert.equal(upd.data['map.engine'], 'maplibre');
  assert.equal(upd.data['map.projection'], '2d');
  assert.equal(upd.data['map.showGeoCards'], false);
  assert.equal(upd.data['map.homeView'].lon, 100);

  // 公开读能反映改动（前端下次挂载即生效）
  const pub = await api('/api/settings');
  assert.equal(pub.data['map.engine'], 'maplibre');

  // 改回默认，避免影响其它用例
  await api('/api/settings', { method: 'PUT', token: adminToken, body: {
    'map.engine': 'cesium', 'map.projection': '3d', 'map.basemap': 'satellite',
    'map.showGeoCards': true, 'map.homeView': { lon: 110, lat: 30, height: 20000000 } } });
  assert.equal((await api('/api/settings')).data['map.engine'], 'cesium');

  // 写入留审计
  const audit = await api('/api/admin/audit?limit=50', { token: adminToken });
  assert.ok(audit.data.items.some((a) => a.action === 'settings.update'));
});

// ══════════════════════════════════════════════════════════════════════════
//  方案（Recipe）：目录 → fork 改参数 → 重跑 → 交付物下载
//  平台不复制参数契约、不自己排 DAG：这两件事都问 SDK（这里是假节点）。
// ══════════════════════════════════════════════════════════════════════════
let fakeNodeUrl;

/** 登记方案引用到的组成项：算子（skill，不参与可见性）+ 数据（data，参与可见性）。 */
function seedComponentCards(sensitivity = 'public', { dataSensitivity = null } = {}) {
  const put = (id, type, level, replace = false) => {
    if (registry.cards.has(id) && !replace) return;
    registry.cards.set(id, {
      card: { id, type, name: id, description: type === 'skill' ? '算子' : '数据',
        compliance: { sensitivity: level } },
      node_url: 'http://node-a', registered_at: new Date().toISOString(), status: 'approved',
      review_note: null, review_history: [], submitted_by: null
    });
  };
  for (const id of ['sdg-aoi', 'sdg-degrade', 'sdg-report']) put(id, 'skill', sensitivity, true);
  for (const id of ['geocard.packed.menggu', 'geocard.oge.lc08-l2']) {
    put(id, 'data', dataSensitivity || sensitivity, true);
  }
}

test('方案：目录只列已批准的，并标出 SDK 状态', async () => {
  fakeNodeUrl = `http://127.0.0.1:${platform.nodeServer.address().port}`;
  const res = await api('/api/recipes');
  assert.equal(res.status, 200);
  const seeded = res.data.items.find((r) => r.id === 'recipe://geonexus/sdg-15-3-1@1.0.0');
  assert.ok(seeded, `目录里应有已批准的方案，实际：${JSON.stringify(res.data.items)}`);
  assert.equal(seeded.source, 'sdk-catalogue');
  assert.deepEqual(seeded.reusable_params, ['year', 'region']);
  assert.deepEqual(seeded.outputs, ['degradation_map', 'report']);
  assert.equal(res.data.sdk.status, 'up');

  // 契约过滤：按"能不能改这个参数"找方案
  assert.equal((await api('/api/recipes?param=year')).data.items.length >= 1, true);
  assert.equal((await api('/api/recipes?param=crs')).data.items.length, 0);
  assert.equal((await api('/api/recipes?role=knowledge')).data.items.length >= 1, true);

  // 发布方案 = 提交一张审批单（与 GeoCard 发布同一条链路）
  const submitted = await api('/api/recipes', { method: 'POST', token: adminToken,
    body: { recipe: { ...fixtureRecipe(), id: 'recipe://muyang/draft@0.1.0' } } });
  assert.equal(submitted.status, 201);
  assert.equal(submitted.data.approval.kind, 'recipe-publish');
  assert.equal(submitted.data.approval.subjectId, 'recipe://muyang/draft@0.1.0');
  assert.equal(submitted.data.approval.status, 'pending');
  assert.equal(submitted.data.approval.sdkState, 'pending', 'SDK 侧也应是 pending');
  const after = await api('/api/recipes');
  assert.equal(after.data.items.some((r) => r.id === 'recipe://muyang/draft@0.1.0'), false);
  assert.equal((await api('/api/recipes?all=true')).data.items.some((r) => r.id === 'recipe://muyang/draft@0.1.0'), true);
  // 公众不能提交（需要 geocard:publish）
  assert.equal((await api('/api/recipes', { method: 'POST', token: publicToken,
    body: { recipe: fixtureRecipe() } })).status, 403);
  // 裁决把决定转发给 SDK：批准后方案才真正可复用
  const decided = await api(`/api/approvals/${submitted.data.approval.id}/decide`, { method: 'POST',
    token: adminToken, body: { decision: 'approve', note: '口径已核对' } });
  assert.equal(decided.status, 200);
  assert.equal(decided.data.item.status, 'approved');
  assert.equal(decided.data.item.sdkState, 'approved');
  assert.equal(registry.recipes.get('recipe://muyang/draft@0.1.0').status, 'approved');
});

test('方案：物化不执行，参数契约错误带字段名回来', async () => {
  fakeNode.planCalls.length = 0;
  const before = sdkWeb.executeBodies.length;

  const ok = await api('/api/recipes/plan', { method: 'POST', token: adminToken,
    body: { recipe: 'recipe://geonexus/sdg-15-3-1@1.0.0', params: { year: 2021 }, runId: 'plan-1', nodeUrl: fakeNodeUrl } });
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.data.plan.tasks.map((t) => t.step), ['s1', 's2', 's3']);
  assert.deepEqual(ok.data.plan.tasks[1].depends_on, ['plan-1:s1']);
  assert.deepEqual(Object.keys(ok.data.plan.deliverables), ['degradation_map', 'report']);
  assert.equal(sdkWeb.executeBodies.length, before, '物化绝不能触发执行');
  assert.equal(fakeNode.planCalls.length, 1);

  const bad = await api('/api/recipes/plan', { method: 'POST', token: adminToken,
    body: { recipe: 'recipe://geonexus/sdg-15-3-1@1.0.0', params: { year: 1999 }, nodeUrl: fakeNodeUrl } });
  assert.equal(bad.status, 400);
  assert.equal(bad.data.code, 2006);
  assert.equal(bad.data.field, 'year');
  assert.equal(bad.data.detail.code, 'param_out_of_range');

  const missing = await api('/api/recipes/plan', { method: 'POST', token: adminToken,
    body: { recipe: 'recipe://geonexus/sdg-15-3-1@1.0.0', params: {}, nodeUrl: fakeNodeUrl } });
  assert.equal(missing.status, 400);
  assert.equal(missing.data.field, 'year');

  const missingRecipe = await api('/api/recipes/plan', { method: 'POST', token: adminToken,
    body: { recipe: 'recipe://geonexus/nope', params: {}, nodeUrl: fakeNodeUrl } });
  assert.equal(missingRecipe.status, 404);
  assert.equal(missingRecipe.data.code, 2005);
});

test('方案：fork 产生新地址与新参数，源方案不动', async () => {
  const res = await api('/api/recipes/fork', { method: 'POST', token: adminToken, body: {
    recipe_id: 'recipe://geonexus/sdg-15-3-1@1.0.0',
    namespace: 'muyang', name: 'sdg-15-3-1-mexico', title: 'SDG 15.3.1 墨西哥 2019',
    params: { year: 2019, region: '墨西哥' }, bbox: [110.4, 14.5, 117.1, 32.7],
    temporal: { start: '2019-01-01', end: '2019-12-31' }
  } });
  assert.equal(res.status, 201);
  assert.equal(res.data.forked.id, 'recipe://muyang/sdg-15-3-1-mexico@1.0.0');
  assert.equal(res.data.binding.status, 'pending', '派生件也要过审，默认待审');
  assert.equal(res.data.binding.parentRecipeId, 'recipe://geonexus/sdg-15-3-1@1.0.0');
  assert.equal(res.data.binding.params.region, '墨西哥');
  assert.equal(res.data.caseId.startsWith('case-'), true, '复用者拿到的是自己的案例');
  // 契约快照落在平台上：前端不必每次去问 SDK 才能画出参数表单
  const names = res.data.binding.paramContract.map((c) => `${c.name}:${c.scope}`);
  assert.deepEqual(names, ['year:reusable', 'region:reusable', 'baseline:fixed']);

  // 源方案在目录里没有被改写
  const source = await api('/api/recipes?all=true');
  const src = source.data.items.find((r) => r.id === 'recipe://geonexus/sdg-15-3-1@1.0.0');
  assert.ok(src);
  const forked = source.data.items.find((r) => r.recipeId === 'recipe://muyang/sdg-15-3-1-mexico@1.0.0');
  assert.equal(forked.status, 'pending');
  // 目录里的同一份方案标为 bound，而不是被绑定遮蔽掉
  const catalogued = source.data.items.find((r) => r.id === 'recipe://muyang/sdg-15-3-1-mexico@1.0.0');
  assert.equal(catalogued.bound, true);

  // 不认识的参数要拒（不是静默忽略）
  const unknown = await api('/api/recipes/fork', { method: 'POST', token: adminToken,
    body: { recipe_id: 'recipe://geonexus/sdg-15-3-1@1.0.0', params: { crs: 'EPSG:4326' } } });
  assert.equal(unknown.status, 422);

  const missing = await api('/api/recipes/fork', { method: 'POST', token: adminToken,
    body: { recipe_id: 'recipe://geonexus/does-not-exist' } });
  assert.equal(missing.status, 404);
});

test('验收：2 数据 + 1 算子 + 1 报告 —— fork → 改参数 → 重跑 → 交付物可下载', async () => {
  // 1) 派生一份自己的方案（复用别人的方法，改自己的参数）
  const forked = await api('/api/recipes/fork', { method: 'POST', token: adminToken, body: {
    recipe_id: 'recipe://geonexus/sdg-15-3-1@1.0.0', namespace: 'acceptance',
    name: 'sdg-mexico-2021', title: '墨西哥土地退化 2021',
    params: { year: 2021, region: '墨西哥' }, bbox: [110.4, 14.5, 117.1, 32.7],
    temporal: { start: '2021-01-01', end: '2021-12-31' }
  } });
  assert.equal(forked.status, 201);
  const caseId = forked.data.caseId;

  // 2) 派生件默认待审，而且审批入口就在平台的"审批"里（与 GeoCard 发布同一条链路）
  assert.equal(forked.data.binding.status, 'pending');
  assert.equal(forked.data.approval.kind, 'recipe-publish');
  assert.equal(forked.data.approval.subjectId, forked.data.forked.id);
  assert.equal(forked.data.approval.status, 'pending');
  assert.equal(registry.recipes.get(forked.data.forked.id).status, 'pending');

  // 组成项必须在目录里可见：组合案例的可见性由组成项决定（见下一个用例）
  seedComponentCards();

  // 3) 未发布的案例不能跑（草稿不是"可复现"的）
  const tooEarly = await api('/api/recipes/run', { method: 'POST', token: adminToken,
    body: { caseId, params: { year: 2021 }, nodeUrl: fakeNodeUrl } });
  assert.equal(tooEarly.status, 409);

  // 4) 审批通过 → SDK 侧 approved → 案例发布 → 才轮到"跑"
  const approvedFork = await api(`/api/approvals/${forked.data.approval.id}/decide`, {
    method: 'POST', token: adminToken, body: { decision: 'approve', note: '验收：口径已核对' } });
  assert.equal(approvedFork.status, 200);
  assert.equal(registry.recipes.get(forked.data.forked.id).status, 'approved');
  const bindingRow = (await api('/api/admin/recipes', { token: adminToken })).data.bindings
    .find((b) => b.id === forked.data.binding.id);
  assert.equal(bindingRow.status, 'approved', '平台侧绑定要跟着审批结果走');

  const published = await api(`/api/cases/${caseId}`, { method: 'PUT', token: adminToken,
    body: { title: '墨西哥土地退化 2021', status: 'published' } });
  assert.equal(published.status, 200);

  const executed = await api('/api/recipes/run', { method: 'POST', token: adminToken,
    body: { caseId, params: { year: 2021 }, runId: 'acc-1', nodeUrl: fakeNodeUrl } });
  assert.equal(executed.status, 202, JSON.stringify(executed.data));
  assert.deepEqual(executed.data.steps.map((s) => s.step), ['s1', 's2', 's3']);
  assert.ok(executed.data.steps.every((s) => s.status === 'succeeded'));

  // 每一步都真的提交给了执行面，且上游产物按方案的 step:// 引用传到下一步
  const bodies = sdkWeb.executeBodies.slice(-3);
  assert.deepEqual(bodies.map((b) => b.skill), ['sdg-aoi', 'sdg-degrade', 'sdg-report']);
  assert.equal(bodies[0].params.region, '墨西哥');
  assert.equal(bodies[1].params.year, 2021, '参数取值来自本次运行的入参');
  assert.equal(bodies[1].params.baseline, 2015, 'fixed 参数由作者钉死');
  assert.equal(bodies[1].params.mask.endsWith('mask.tif'), true, 'step://s1/mask 应解析成 s1 的产物');
  assert.equal(bodies[2].params.degradation.endsWith('degradation.tif'), true);

  // 4) 交付物：方案"结论"的集合（退化栅格 + 报告），不是每一步的副产品。
  //    中间产物（掩膜、转移矩阵）留在运行记录里，但只有 outputs 声明过的才算交付。
  const deliverables = await api(`/api/cases/${caseId}/deliverables`, { token: adminToken });
  assert.equal(deliverables.data.count, 2, JSON.stringify(deliverables.data.items));
  assert.deepEqual(deliverables.data.items.map((d) => d.name).sort(), ['degradation_map', 'report']);
  const byName = Object.fromEntries(deliverables.data.items.map((d) => [d.name, d]));
  assert.equal(byName.degradation_map.role, 'data');
  assert.equal(byName.degradation_map.stepId, 's2');
  assert.equal(byName.degradation_map.status, 'ready');
  assert.equal(byName.report.role, 'knowledge');
  assert.equal(byName.report.mediaType, 'text/html');

  // 5) 报告可下载（受控读取：白名单根目录内才放行）
  const reportRes = await fetch(`${base}/api/deliverables/${byName.report.id}/report`,
    { headers: { authorization: `Bearer ${adminToken}` } });
  assert.equal(reportRes.status, 200);
  assert.equal(reportRes.headers.get('content-type'), 'text/html; charset=utf-8');
  assert.match(await reportRes.text(), /SDG 15\.3\.1/);
  assert.equal((await fetch(`${base}/api/deliverables/${byName.report.id}/report`)).status, 401, '交付物下载要登录');

  // 6) 图层视图：四级 LOD + 双时间轴（数据时间 ≠ 执行时间）
  const layers = await api(`/api/cases/${caseId}/layers`);
  assert.equal(layers.status, 200);
  const view = layers.data.view;
  assert.equal(view.spatial, true);
  assert.deepEqual(view.bbox, [110.4, 14.5, 117.1, 32.7]);
  assert.deepEqual(view.layers.map((l) => l.level), ['L1', 'L2', 'L3', 'L4']);
  assert.equal(view.layers[0].kind, 'aoi');
  assert.deepEqual(view.layers[1].steps.map((s) => s.stepId), ['s1', 's2', 's3']);
  assert.equal(view.layers[1].playback, true);
  assert.deepEqual(view.layers[2].groups.map((g) => g.role).sort(), ['data', 'knowledge']);
  assert.equal(view.layers[3].available, true);
  assert.equal(view.timeline.dataTime.start, '2021-01-01');
  assert.ok(view.timeline.executionTime.start);
  assert.equal(view.recipe.recipeId, 'recipe://acceptance/sdg-mexico-2021@1.0.0');
  assert.deepEqual(view.recipe.params.region, '墨西哥');

  // 7) 换一组参数再跑一次：两次运行互不覆盖，交付物按运行分开
  const rerun = await api('/api/recipes/run', { method: 'POST', token: adminToken,
    body: { caseId, params: { year: 2019 }, runId: 'acc-2', nodeUrl: fakeNodeUrl } });
  assert.equal(rerun.status, 202);
  const again = await api(`/api/cases/${caseId}/deliverables`, { token: adminToken });
  assert.equal(again.data.count, 4, '第二次运行产生新的一批交付物，不覆盖第一次');
  assert.equal((await api('/api/recipes/run', { method: 'POST', token: adminToken,
    body: { caseId, params: { year: 1990 }, nodeUrl: fakeNodeUrl } })).status, 400, '越界参数在物化阶段就被拒');
  assert.equal((await api('/api/recipes/run', { method: 'POST',
    body: { caseId, params: { year: 2019 }, nodeUrl: fakeNodeUrl } })).status, 401, '未登录不能运行方案');
});

test('非空间案例：没有 bbox 就不上地球，但图层视图依然可用', async () => {
  const created = await api('/api/cases', { method: 'POST', token: adminToken, body: {
    title: '非空间：指标口径说明', status: 'published', provenance: 'archival'
  } });
  const view = await api(`/api/cases/${created.data.item.id}/layers`);
  assert.equal(view.status, 200);
  assert.equal(view.data.view.spatial, false, '没有 bbox 就要老实说，不能硬塞到地球上');
  assert.equal(view.data.view.bbox, null);
  assert.deepEqual(view.data.view.layers.map((l) => l.level), ['L2', 'L3', 'L4']);
  assert.equal((await api('/api/cases/case-does-not-exist/layers')).status, 404);
});

test('未绑定方案的案例不能跑；SDK 掉线时目录降级但平台数据仍在', async () => {
  const created = await api('/api/cases', { method: 'POST', token: adminToken, body: {
    title: '只有 runSpec 的旧案例', status: 'published',
    runSpec: { skill: 'ndvi-analysis', params: {} }
  } });
  const noBinding = await api('/api/recipes/run', { method: 'POST', token: adminToken,
    body: { caseId: created.data.item.id, nodeUrl: fakeNodeUrl } });
  assert.equal(noBinding.status, 422);
  assert.match(noBinding.data.error, /方案/);

  // 目录里一份方案都没有时：平台侧绑定**不能跟着消失**，而且要说清目录是空的。
  const original = registry.recipes;
  registry.recipes = new Map();
  const catalogue = await api('/api/recipes');
  assert.equal(catalogue.status, 200);
  assert.equal(catalogue.data.sdk.status, 'up');
  assert.equal(catalogue.data.catalogueCount, 0);
  assert.equal(catalogue.data.items.some((r) => r.recipeId === 'recipe://acceptance/sdg-mexico-2021@1.0.0'), true,
    '平台记录的案例配方不因 SDK 目录为空而消失');
  registry.recipes = original;
});

// ══════════════════════════════════════════════════════════════════════════
//  可见性继承：组合案例不能成为绕过访问控制的捷径
// ══════════════════════════════════════════════════════════════════════════
test('可见性：组成项受限 ⇒ 整案对外 404（对管理员仍可见）', async () => {
  // 一个"公开"的案例，其中一个组成算子是 restricted
  const foo = await api('/api/recipes/fork', { method: 'POST', token: adminToken, body: {
    recipe_id: 'recipe://geonexus/sdg-15-3-1@1.0.0', namespace: 'vis', name: 'restricted-demo',
    params: { year: 2019 }, bbox: [100, 20, 110, 30]
  } });
  assert.equal(foo.status, 201);
  const caseId = foo.data.caseId;
  await api(`/api/cases/${caseId}`, { method: 'PUT', token: adminToken,
    body: { title: '含受限算子的案例', status: 'published' } });

  // 起初组成项都是 public → 访客可见
  seedComponentCards('public');
  assert.equal((await api(`/api/cases/${caseId}`)).status, 200, '组成项全公开时访客应能看到');
  assert.equal((await api(`/api/cases/${caseId}/layers`)).status, 200);

  // 把其中一份**数据**降为 restricted → 组合的最严值就是 restricted
  // （改算子不会影响可见性：算子不承载内容，见 lib/visibility.js 的 GATING_ROLES）
  seedComponentCards('public', { dataSensitivity: 'restricted' });
  const anonymous = await api(`/api/cases/${caseId}`);
  assert.equal(anonymous.status, 404, '组成项受限时对外必须是 404，不能是 403');
  assert.equal(anonymous.data.error, '案例不存在', '不能透露"存在但你看不到"');
  assert.equal((await api(`/api/cases/${caseId}/layers`)).status, 404);
  assert.equal((await api(`/api/cases/${caseId}/deliverables`)).status, 404);

  // 列表里也不该出现（连"有个隐藏案例"都别暗示）
  const list = await api('/api/cases');
  assert.equal(list.data.items.some((i) => i.id === caseId), false);
  assert.ok(list.data.hidden >= 1, '隐藏了多少条要能对管理员说清楚');
  const sdkCases = await api('/api/sdk/cases');
  assert.equal(sdkCases.data.items.some((i) => i.id === caseId), false);

  // 管理员通配：同一份数据他看得到，并且能看到被挡的原因留在审计里
  assert.equal((await api(`/api/cases/${caseId}`, { token: adminToken })).status, 200);
  assert.equal((await api(`/api/cases/${caseId}/layers`, { token: adminToken })).data.view.visibility.visibility,
    'restricted');
  const audit = await api('/api/admin/audit?limit=50', { token: adminToken });
  const denied = audit.data.items.find((a) => a.action === 'case.hidden' && a.subject === caseId);
  assert.ok(denied, '被挡的访问要留审计');
  const detail = typeof denied.detail === 'string' ? JSON.parse(denied.detail) : denied.detail;
  assert.equal(detail.missing.length, 0, '这不是"解析不到"，是"档位不够"');
  assert.equal(detail.levels['geocard.packed.menggu'], 'restricted');
  assert.equal(detail.levels['sdg-aoi'], undefined, '算子不参与可见性判定，不该出现在 levels 里');
  assert.deepEqual(detail.granted, ['public']);

  // 有 visibility:restricted scope 的用户能看（登录默认就有）；sensitive 需要显式授权
  const okUser = await api('/api/cases/' + caseId, { token: publicToken });
  assert.equal(okUser.status, 200, '登录用户默认能看 restricted');
  seedComponentCards('public', { dataSensitivity: 'sensitive' });
  assert.equal((await api(`/api/cases/${caseId}`, { token: publicToken })).status, 404);
  grant('public@test.local', ['public_visitor'], ['earth:view', 'card:read', 'case:read', 'visibility:sensitive'], platform.dataDir);
  // 已登录令牌的 scopes 是签发时写进 users 表的，重新登录才生效
  const again = await api('/api/auth/login', { method: 'POST',
    body: { email: 'public@test.local', password: 'pw-public-123' } });
  assert.equal((await api(`/api/cases/${caseId}`, { token: again.data.token })).status, 200);

  // 收尾：恢复公开，避免影响后续用例
  seedComponentCards('public');
  assert.equal((await api(`/api/cases/${caseId}`)).status, 200);
});

test('可见性：组成项解析不到 ⇒ 整案不可见（不存在与无权同等对待）', async () => {
  const foo = await api('/api/recipes/fork', { method: 'POST', token: adminToken, body: {
    recipe_id: 'recipe://geonexus/sdg-15-3-1@1.0.0', namespace: 'vis', name: 'missing-demo',
    params: { year: 2019 }
  } });
  const caseId = foo.data.caseId;
  await api(`/api/cases/${caseId}`, { method: 'PUT', token: adminToken, body: { status: 'published' } });

  // 目录里没有任何组成项：既可能是没登记，也可能是无权看 —— 对调用方是同一件事
  const saved = new Map(registry.cards);
  registry.cards.clear();   // 数据卡片都没了：既可能没登记，也可能无权看
  assert.equal((await api(`/api/cases/${caseId}`)).status, 404);
  assert.equal((await api(`/api/cases/${caseId}`, { token: adminToken })).status, 404, '管理员也不能看"来源不明"的组合');
  registry.cards = saved;
  seedComponentCards('public');
  assert.equal((await api(`/api/cases/${caseId}`, { token: adminToken })).status, 200);
});

test('可见性：可选组成项缺席不影响可见性（作者已声明缺了也能跑）', async () => {
  // 平台侧规则由 lib/visibility.js 提供，直接用它的测试钉住边界
  const { evaluateVisibility, composeVisibility, normalizeVisibility, canSee } = await import('../lib/visibility.js');
  // 全是 public 就该是 public —— 不能因为"默认档是 restricted"而被抬高
  assert.equal(composeVisibility(['public', 'public']), 'public');
  assert.equal(composeVisibility([]), 'restricted');
  assert.equal(normalizeVisibility(undefined), 'restricted');
  assert.equal(normalizeVisibility('top-secret'), 'secret');
  assert.equal(evaluateVisibility({ own: 'public', components: [
    { id: 'a', visibility: 'public' }, { id: 'b', visibility: null, required: false }
  ] }).visible, true, '可选组成项解析不到不该挡住整案');
  assert.equal(evaluateVisibility({ own: 'public', components: [
    { id: 'a', visibility: 'public' }, { id: 'b', visibility: null }
  ] }).visible, false);
  assert.equal(canSee('sensitive', ['restricted']), false);
  assert.equal(canSee('sensitive', ['sensitive']), true);
});

// ══════════════════════════════════════════════════════════════════════════
//  后台：方案 / 交付物 两个管理页签的数据面
// ══════════════════════════════════════════════════════════════════════════
test('后台方案页签：绑定 + 目录 + 待审计数；交付物页签：按角色统计', async () => {
  const recipesView = await api('/api/admin/recipes', { token: adminToken });
  assert.equal(recipesView.status, 200);
  assert.ok(recipesView.data.bindingCount >= 1);
  assert.ok(recipesView.data.catalogueCount >= 1, '目录来自 SDK');
  assert.equal(recipesView.data.sdk.status, 'up');
  const binding = recipesView.data.bindings[0];
  for (const key of ['id', 'caseId', 'recipeId', 'params', 'status', 'steps', 'reusableParams', 'fixedParams', 'deliverables']) {
    assert.ok(key in binding, `绑定视图缺少 ${key}`);
  }
  assert.equal(typeof recipesView.data.pendingApprovals, 'number');

  const deliverablesView = await api('/api/admin/deliverables', { token: adminToken });
  assert.equal(deliverablesView.status, 200);
  assert.ok(deliverablesView.data.count >= 1);
  assert.ok(deliverablesView.data.byRole.knowledge >= 1);
  assert.ok(deliverablesView.data.runs >= 1);
  const knowledgeOnly = await api('/api/admin/deliverables?role=knowledge', { token: adminToken });
  assert.equal(knowledgeOnly.data.items.every((d) => d.role === 'knowledge'), true);

  // 管理面鉴权：公众不得访问（需要 approval:list）
  assert.equal((await api('/api/admin/recipes', { token: publicToken })).status, 403);
  assert.equal((await api('/api/admin/deliverables', { token: publicToken })).status, 403);
  assert.equal((await api('/api/admin/recipes')).status, 401);
});

test('案例编辑：可空字段能真的被清空（bbox/时间窗）', async () => {
  const created = await api('/api/cases', { method: 'POST', token: adminToken,
    body: { title: '可空字段', status: 'draft', bbox: [100, 20, 110, 30], temporal: { start: '2020-01-01' } } });
  const id = created.data.item.id;
  assert.deepEqual(created.data.item.bbox, [100, 20, 110, 30]);
  // 显式传 null 表示"清空"，不是"没改"（?? 会把两者混为一谈）
  const cleared = await api(`/api/cases/${id}`, { method: 'PUT', token: adminToken, body: { bbox: null } });
  assert.equal(cleared.data.item.bbox, null);
  // 局部提交：没提到的字段保持原样，标题也不用重复带一遍
  assert.equal(cleared.data.item.title, '可空字段');
  assert.deepEqual(cleared.data.item.temporal, { start: '2020-01-01' }, '没提到的字段不该被顺手清掉');
  const clearedBoth = await api(`/api/cases/${id}`, { method: 'PUT', token: adminToken,
    body: { temporal: null } });
  assert.equal(clearedBoth.data.item.temporal, null);
  await api(`/api/cases/${id}`, { method: 'DELETE', token: adminToken });
});

test('图层视图：组成项带 bbox（血缘弧线的两端）', async () => {
  // 给数据卡片加上覆盖范围：案例范围 ↔ 提供数据的资产，血缘弧线才有两端
  seedComponentCards('public');
  for (const [id, bbox] of [['geocard.packed.menggu', [87.7, 41.6, 119.9, 52.1]],
    ['geocard.oge.lc08-l2', [110.4, 14.5, 117.1, 32.7]]]) {
    const entry = registry.cards.get(id);
    entry.card.spatial = { bbox, crs: 'EPSG:4326' };
    registry.cards.set(id, entry);
  }
  const foo = await api('/api/recipes/fork', { method: 'POST', token: adminToken, body: {
    recipe_id: 'recipe://geonexus/sdg-15-3-1@1.0.0', namespace: 'viz', name: 'arcs',
    params: { year: 2019 }, bbox: [100, 20, 120, 45]
  } });
  const caseId = foo.data.caseId;
  await api(`/api/cases/${caseId}`, { method: 'PUT', token: adminToken, body: { status: 'published' } });

  const view = (await api(`/api/cases/${caseId}/layers`)).data.view;
  assert.equal(view.spatial, true);
  const byId = Object.fromEntries(view.components.map((c) => [c.id, c]));
  assert.equal(byId['geocard.packed.menggu'].role, 'data');
  assert.deepEqual(byId['geocard.packed.menggu'].bbox, [87.7, 41.6, 119.9, 52.1]);
  assert.equal(byId['geocard.packed.menggu'].visibility, 'public');
  // 算子没有 bbox 也不该让视图失败：弧线只画得出来的那些
  const operator = view.components.find((c) => c.role === 'skill');
  assert.ok(operator, '算子在组成项里，但不参与可见性判定');
  assert.equal(operator.bbox, null);
});


// ══════════════════════════════════════════════════════════════════════════
//  候鸟—湿地案例：种子脚本 + 受控几何接口 + 可见性分层
// ══════════════════════════════════════════════════════════════════════════
const FLIGHTWAY_CASE = 'case-eaaf-wetland-priority';
const CASE_DIR = path.resolve(ROOT, '..', '..', 'core', 'examples', 'flightway_wetland');

async function seedFlightway(extra = []) {
  // 测试文件是 ESM：用动态 import 拿 child_process（与其它用例同一写法）
  const { execFileSync } = await import('node:child_process');
  return execFileSync(process.execPath,
    [path.join(ROOT, 'scripts', 'seed-flightway-case.mjs'), '--case-dir', CASE_DIR, ...extra],
    { cwd: ROOT, env: { ...process.env, DATA_DIR: platform.dataDir,
      UPLOADS_DIR: path.join(platform.dataDir, 'uploads') }, encoding: 'utf8' });
}

test('种子脚本：把候鸟—湿地案例种进平台（开箱可见）', async () => {
  const out = await seedFlightway(['--public']);
  assert.match(out, /已种入平台/);
  const detail = await api(`/api/cases/${FLIGHTWAY_CASE}`);
  assert.equal(detail.status, 200, '开放演示模式下访客应能看到案例');
  assert.equal(detail.data.item.visibility, 'public');
  const view = (await api(`/api/cases/${FLIGHTWAY_CASE}/layers`)).data.view;
  assert.equal(view.spatial, true);
  // bbox 由 147 个真实坐标给出（论文补充材料 Table 3）
  assert.deepEqual(view.bbox, [89.7, -10.05, 140.8, 50.2]);
  // 组成项：5 个算子（原文五步）+ 3 份数据（两份公开 + 一份受限计数）
  const ids = view.components.map((c) => c.id);
  for (const id of ['geocard.eaaf.rfi-priority-sites', 'geocard.eaaf.rfi-country-summary',
    'geocard.eaaf.waterbird-counts-restricted']) {
    assert.ok(ids.includes(id), `${id} 要在组成项里`);
  }
  for (const skill of ['rfi-framework-review', 'rfi-site-data', 'rfi-pc1-select',
    'rfi-characterise', 'rfi-report']) {
    assert.ok(ids.includes(skill), `${skill} 是原文五步之一`);
  }
  // 旧的合成 NDWI 演示已经移出这个案例：组成项与几何都不该再引用
  assert.equal(ids.some((id) => id.includes('sample') || id.includes('wetland-imagery')), false);
  assert.equal(ids.includes('geocard.eaaf.priority-sites-restricted'), false);
  const dataComponents = view.components.filter((c) => c.role === 'data');
  assert.equal(dataComponents.length, 3);
  assert.equal(dataComponents.find((c) => c.id === 'geocard.eaaf.waterbird-counts-restricted').visibility,
    'public', '开放演示模式下受限组成项也被放开');
  // 组成项带名称：界面上的"所用数据"表要能读出这是什么数据
  assert.ok(dataComponents.every((c) => c.title && c.title.length > 0));
  // 几何清单由平台给出受控地址，前端不自己拼路径
  assert.deepEqual(view.geometry.map((g) => g.name), ['sites']);
  assert.ok(view.geometry.every((g) => g.url.startsWith(`/api/cases/${FLIGHTWAY_CASE}/geometry/`)));
  // 处理过程：原文五步
  assert.deepEqual(view.recipe.steps.map((s) => s.uses),
    ['rfi-framework-review', 'rfi-site-data', 'rfi-pc1-select', 'rfi-characterise', 'rfi-report']);
  assert.equal(view.recipe.recipeId, 'recipe://geonexus/eaaf-wetland-priority@2.0.0');
  // 交付物：四个真实产物（三份 CSV + 一份报告）
  const byName = Object.fromEntries(view.recipe.contract.map((p) => [p.name, p]));
  assert.equal(byName.threshold_prc_mongolia.default, 10);
  assert.equal(byName.threshold_others.default, 1);
  assert.equal(byName.one_percent_rule.scope, 'fixed', '1% 规则是定义，不是可调阈值');
  const groupRoles = view.layers.find((l) => l.kind === 'layer-group').groups.map((g) => g.role);
  assert.deepEqual(groupRoles.sort(), ['data', 'knowledge']);
  const deliverableNames = view.layers.find((l) => l.kind === 'layer-group')
    .groups.flatMap((g) => g.items.map((i) => i.name)).sort();
  assert.deepEqual(deliverableNames,
    ['country_characteristics', 'priority_selection', 'priority_sites', 'report']);
});

test('案例事实块：国别汇总（原文 Table 4）与两套保护口径都随案例返回', async () => {
  await seedFlightway(['--public']);
  const detail = await api(`/api/cases/${FLIGHTWAY_CASE}`, { token: adminToken });
  const facts = detail.data.item.facts;
  assert.ok(facts, '案例要带上公开事实块');
  assert.equal(facts.country_summary.length, 10, '10 个亚洲国家');
  assert.equal(facts.totals.priority_sites, 147);
  assert.equal(facts.totals.coastal, 91);
  assert.equal(facts.totals.inland, 56);
  // 口径差异：正文 Table 4 的 108 vs 补充材料粗体标记的 117 —— 两个都保留，不做人工对齐
  assert.equal(facts.totals.protected_table4, 108);
  assert.equal(facts.totals.protected_bold_marks, 117);
  assert.equal(facts.totals.protected_mark_gap, 9);
  // 2 处 PRC 站点分值低于原文声明的阈值 10，却仍在公开名单里
  assert.equal(facts.totals.prc_below_threshold, 2);
  assert.equal(facts.totals.sites_without_pc1, 26, '蒙古 11 处只有名次 + PRC 15 处只有文字说明');
  assert.match(facts.source.doi, /10\.1038\/s41598-025-31727-2/);
  const view = (await api(`/api/cases/${FLIGHTWAY_CASE}/layers`)).data.view;
  assert.equal(view.facts.totals.protected_bold_marks, 117, '图层视图也带同一份事实块');
  // 研究区域：迁飞区 10 国
  assert.equal(facts.region.countries.length, 10);
  assert.deepEqual(facts.region.bbox, [89.7, -10.05, 140.8, 50.2]);
});

test('几何接口：147 个真实点位、属性齐全、越权与越界都要拒', async () => {
  await seedFlightway(['--public']);
  const res = await fetch(`${base}/api/cases/${FLIGHTWAY_CASE}/geometry/sites`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /geo\+json/);
  const fc = await res.json();
  assert.equal(fc.type, 'FeatureCollection');
  assert.equal(fc.features.length, 147, '147 处优先湿地，一个点一处');

  // 期望的属性集：界面（颜色/大小/筛选/详情）就靠这些字段
  const required = ['site_id', 'name', 'country', 'wetland_type', 'protected', 'pc1', 'rank',
    'species_count', 'designations', 'threatened'];
  for (const feature of fc.features) {
    const props = feature.properties;
    assert.equal(feature.geometry.type, 'Point');
    assert.equal(feature.geometry.coordinates.length, 2);
    for (const key of required) assert.ok(key in props, `要素缺字段 ${key}`);
    assert.equal(typeof props.protected, 'boolean');
    assert.equal(typeof props.wetland_type, 'string');
    assert.ok(['coastal', 'inland'].includes(props.wetland_type));
    assert.ok(props.pc1 === null || typeof props.pc1 === 'number');
    assert.ok(props.rank === null || typeof props.rank === 'number');
    assert.equal(typeof props.species_count, 'number');
    // 真实公布的坐标：不带 synthetic 标记（那是合成/示意数据的约定）
    assert.equal('synthetic' in props, false);
  }

  // 与论文一致的分项合计
  const coastal = fc.features.filter((f) => f.properties.wetland_type === 'coastal').length;
  const inland = fc.features.filter((f) => f.properties.wetland_type === 'inland').length;
  const protectedBold = fc.features.filter((f) => f.properties.protected === true).length;
  const noScore = fc.features.filter((f) => f.properties.pc1 === null).length;
  assert.equal(coastal, 91);
  assert.equal(inland, 56);
  assert.equal(protectedBold, 117, '补充材料粗体标记');
  assert.equal(noScore, 26, '没有 PC1 的站点必须保留为 null，不能填 0');
  // 蒙古 11 处只有名次 1–11
  const mongolia = fc.features.filter((f) => f.properties.country === 'Mongolia');
  assert.equal(mongolia.length, 11);
  assert.deepEqual(mongolia.map((f) => f.properties.rank).sort((a, b) => a - b),
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  // 大小分档随几何一起给出（前端两个引擎都用它，不各自重算）
  assert.ok(fc.features.every((f) => typeof f.properties.pc1_band === 'string'));
  const top = [...fc.features].sort((a, b) => b.properties.pc1 - a.properties.pc1)[0];
  assert.ok(top.properties.pc1 > 800, '最高分值来自原文（825.49）');
  assert.equal(top.properties.pc1_band, 'xl');
  assert.ok(top.properties.species_count > 0);

  // 不存在的几何 → 404（不是 500，也不是空文件）
  assert.equal((await api(`/api/cases/${FLIGHTWAY_CASE}/geometry/nope`)).status, 404);
  // 退役的合成图层：接口不该再认它们（陈旧文件留在 uploads/ 也没关系）
  assert.equal((await api(`/api/cases/${FLIGHTWAY_CASE}/geometry/water_change`)).status, 404);
});

test('可见性分层：受限组成项在场时访客拿不到案例，也拿不到几何', async () => {
  await seedFlightway([]);   // 默认模式：逐笔计数数据敏感度 restricted
  const anonCase = await api(`/api/cases/${FLIGHTWAY_CASE}`);
  assert.equal(anonCase.status, 404, '组合含受限组成项 ⇒ 对外不存在');
  assert.equal(anonCase.data.error, '案例不存在');
  assert.equal((await api(`/api/cases/${FLIGHTWAY_CASE}/layers`)).status, 404);
  assert.equal((await api(`/api/cases/${FLIGHTWAY_CASE}/geometry/sites`)).status, 404,
    '几何与图层必须同一道门');
  const list = await api('/api/cases');
  assert.equal(list.data.items.some((i) => i.id === FLIGHTWAY_CASE), false);
  // 管理员看得到，并能读出档位与原因
  const adminView = await api(`/api/cases/${FLIGHTWAY_CASE}/layers`, { token: adminToken });
  assert.equal(adminView.status, 200);
  assert.equal(adminView.data.view.visibility.visibility, 'restricted');
  assert.deepEqual(adminView.data.view.visibility.missing, []);
  assert.equal(adminView.data.view.visibility.levels['geocard.eaaf.waterbird-counts-restricted'],
    'restricted', '受限的是那份逐笔计数数据');
  // 收尾：恢复开放演示，避免影响后续用例
  await seedFlightway(['--public']);
});
