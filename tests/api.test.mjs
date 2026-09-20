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
  requests: [],
  apiKeysSeen: [],
  reset() { this.cards.clear(); this.requests.length = 0; this.apiKeysSeen.length = 0; }
};

function startFakeRegistry() {
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
      return json(404, { detail: 'not found' });
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

// ── 假 SDK Web BFF（8900 的角色）：唯一带 task_id 的入口 ─────────────────
const sdkWeb = { loginCalls: 0, executeBodies: [], cancels: [], taskPolls: 0, failExecute: false };

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
        return json(202, { task_id: 'task-abc123', status: 'queued' });
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

function startPlatform({ registryUrl, adminEmails, sdkWebUrl, artifactRoots, jwksUrl }) {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gnx-test-'));
  const env = { ...process.env, PORT: String(3200 + Math.floor(Math.random() * 300)),
    DATA_DIR: tmpDir, UPLOADS_DIR: path.join(tmpDir, 'uploads'),
    REGISTRY_URL: registryUrl, SDK_REGISTRY_API_KEY: API_KEY, ADMIN_EMAILS: adminEmails,
    SDK_WEB_URL: sdkWebUrl, SDK_WEB_USER: 'admin', SDK_WEB_PASSWORD: 'admin',
    SDK_NODE_URL: 'http://127.0.0.1:8787', ARTIFACT_ROOTS: artifactRoots,
    ...(jwksUrl ? { IDENTITY_JWKS_URL: jwksUrl } : {}) };
  const child = spawn(process.execPath, ['server.js'], { cwd: ROOT, env });
  spawned.push(child);
  return new Promise((resolve, reject) => {
    let out = '';
    const timer = setTimeout(() => reject(new Error(`平台服务未在 15s 内就绪：${out}`)), 15000);
    child.stdout.on('data', (d) => {
      out += d.toString();
      const m = out.match(/running at http:\/\/localhost:(\d+)/);
      if (m) { clearTimeout(timer); resolve({ child, port: Number(m[1]) }); }
    });
    child.stderr.on('data', (d) => { out += d.toString(); });
    child.on('exit', (code) => { if (code) reject(new Error(`平台服务退出 code=${code}: ${out}`)); });
  });
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
  const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), 'gnx-artifacts-'));
  fs.writeFileSync(path.join(artifacts, 'ndvi.tif'), 'GEOTIFF-PLACEHOLDER');
  sdkWeb.artifactDir = artifacts;
  platform = await startPlatform({ registryUrl: `http://127.0.0.1:${fake.port}`, adminEmails: 'admin@test.local',
    sdkWebUrl: `http://127.0.0.1:${fakeWeb.port}`, artifactRoots: artifacts,
    jwksUrl: 'http://127.0.0.1:1/.well-known/jwks.json' });   // 故意指向不可达地址：会话令牌路径不受影响
  base = `http://127.0.0.1:${platform.port}`;
  // 管理员与公众账号各一
  const a = await api('/api/auth/register', { method: 'POST', body: { name: '管理员', email: 'admin@test.local', password: 'pw-admin-123' } });
  adminToken = a.data.token;
  const u = await api('/api/auth/register', { method: 'POST', body: { name: '公众用户', email: 'public@test.local', password: 'pw-public-123' } });
  publicToken = u.data.token;
  platform.registryServer = fake.server;
  platform.webServer = fakeWeb.server;
});

after(() => {
  for (const c of spawned) { try { c.kill() } catch { /* 已退出 */ } }
  platform?.child?.kill();
  platform?.registryServer?.close();
  platform?.webServer?.close();
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
  platform.registryServer.close();     // 断掉假注册中心
  const r = await api('/api/sdk/geocards');
  assert.equal(r.status, 503);
  assert.match(r.data.error, /连不上 SDK Registry/);
  assert.ok(r.data.hint);
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
  const rotate = () => {   // 模拟 Java 侧重启/轮换密钥
    ({ publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }));
    jwk = publicKey.export({ format: 'jwk' });
    kid = `test-kid-${Date.now()}`;
    return kid;
  };
  return new Promise((resolve) => server.listen(0, '127.0.0.1',
    () => resolve({ server, port: server.address().port, sign, rotate, currentKid: () => kid })));
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
    const first = await fetch(`${b2}/api/admin/overview`, { headers: { authorization: `Bearer ${after}` } });
    assert.equal(first.status, 401, '首次遇到未知 kid 会拒绝，并触发后台重取');

    await new Promise((r) => setTimeout(r, 500));        // 等重取完成
    const second = await fetch(`${b2}/api/admin/overview`, { headers: { authorization: `Bearer ${after}` } });
    assert.equal(second.status, 200, `重取 JWKS 后应接受新 kid=${newKid} 的令牌`);
  } finally {
    jwks2.server.close();
    p2.child.kill();
  }
});
