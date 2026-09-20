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

// ── 平台服务（隔离 DATA_DIR）─────────────────────────────────────────────
let platform; let base; let tmpDir;

function startPlatform({ registryUrl, adminEmails }) {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gnx-test-'));
  const env = { ...process.env, PORT: String(3200 + Math.floor(Math.random() * 300)),
    DATA_DIR: tmpDir, UPLOADS_DIR: path.join(tmpDir, 'uploads'),
    REGISTRY_URL: registryUrl, SDK_REGISTRY_API_KEY: API_KEY, ADMIN_EMAILS: adminEmails };
  const child = spawn(process.execPath, ['server.js'], { cwd: ROOT, env });
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
  platform = await startPlatform({ registryUrl: `http://127.0.0.1:${fake.port}`, adminEmails: 'admin@test.local' });
  base = `http://127.0.0.1:${platform.port}`;
  // 管理员与公众账号各一
  const a = await api('/api/auth/register', { method: 'POST', body: { name: '管理员', email: 'admin@test.local', password: 'pw-admin-123' } });
  adminToken = a.data.token;
  const u = await api('/api/auth/register', { method: 'POST', body: { name: '公众用户', email: 'public@test.local', password: 'pw-public-123' } });
  publicToken = u.data.token;
  platform.registryServer = fake.server;
});

after(() => {
  platform?.child?.kill();
  platform?.registryServer?.close();
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
