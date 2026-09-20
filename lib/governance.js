'use strict';
/** 治理面：案例库、审批、配额、九大模块的内容管理，以及 GeoCard 发布/审核。
 *
 *  设计约束（见 docs/user-management.md）：
 *   · 身份与权限的**权威**不在这里，这里只做「谁能做什么」的落地判定；
 *   · 资产语义的权威在 SDK：发布 = 提交到 SDK Registry 的审核队列，本模块只镜像单据；
 *   · 所有写操作都记审计（谁、何时、对什么、结果）。
 */

const crypto = require('crypto');
const path = require('path');

const CASE_STATES = ['draft', 'published', 'archived'];
const APPROVAL_STATES = ['pending', 'approved', 'rejected', 'withdrawn'];
/** 九大模块：与门户信息架构一一对应，后台按模块管理内容。 */
const MODULES = [
  'portal-home', 'visual-earth', 'global-cases', 'data-resources', 'operator-models',
  'compute-platform', 'open-community', 'super-agent', 'typical-apps'
];

function createGovernance(ctx) {
  const { db, send, readBody, requireAuth, getAuthUser, sdk, sdkWeb, uploadsDir, nowIso, logger } = ctx;
  const id = (prefix) => `${prefix}-${crypto.randomBytes(6).toString('hex')}`;

  // ── 建表 ──────────────────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS cases (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      question TEXT,
      aoi TEXT,
      data TEXT NOT NULL DEFAULT '[]',
      processing TEXT,
      outputs TEXT NOT NULL DEFAULT '[]',
      provenance TEXT NOT NULL DEFAULT 'archival',
      bbox TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      ownerUserId TEXT,
      geoCardId TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS approvals (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      subjectId TEXT NOT NULL,
      title TEXT,
      payload TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'pending',
      submittedBy TEXT,
      submittedByEmail TEXT,
      decidedBy TEXT,
      decidedAt TEXT,
      note TEXT,
      sdkState TEXT,
      sdkError TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS quotas (
      id TEXT PRIMARY KEY,
      scope TEXT NOT NULL,
      subject TEXT NOT NULL,
      period TEXT NOT NULL DEFAULT 'monthly',
      limitAmount REAL NOT NULL DEFAULT 0,
      usedAmount REAL NOT NULL DEFAULT 0,
      unit TEXT NOT NULL DEFAULT 'core-hour',
      updatedAt TEXT NOT NULL,
      UNIQUE(scope, subject, period)
    );
    CREATE TABLE IF NOT EXISTS module_items (
      id TEXT PRIMARY KEY,
      module TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT,
      body TEXT,
      link TEXT,
      tag TEXT,
      sortOrder INTEGER NOT NULL DEFAULT 0,
      visible INTEGER NOT NULL DEFAULT 1,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS case_runs (
      id TEXT PRIMARY KEY,
      caseId TEXT NOT NULL,
      sdkTaskId TEXT,
      skill TEXT,
      params TEXT,
      status TEXT NOT NULL DEFAULT 'queued',
      sdkStatus TEXT,
      progress REAL DEFAULT 0,
      message TEXT,
      outputs TEXT,
      error TEXT,
      createdBy TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      finishedAt TEXT
    );
    CREATE TABLE IF NOT EXISTS audit_events (
      id TEXT PRIMARY KEY,
      at TEXT NOT NULL,
      actor TEXT,
      actorEmail TEXT,
      action TEXT NOT NULL,
      subject TEXT,
      detail TEXT,
      result TEXT,
      requestId TEXT
    );
  `);

  try { db.exec('ALTER TABLE cases ADD COLUMN runSpec TEXT'); } catch { /* 列已存在 */ }

  const j = (v) => JSON.stringify(v ?? null);
  const p = (v, fallback) => { try { return v ? JSON.parse(v) : fallback; } catch { return fallback; } };

  function audit(actor, action, subject, detail, result = 'ok') {
    db.prepare(`INSERT INTO audit_events (id, at, actor, actorEmail, action, subject, detail, result, requestId)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id('aud'), nowIso(), actor?.id || 'anonymous', actor?.email || null, action, subject || null,
        typeof detail === 'string' ? detail : j(detail), result, ctx.requestId?.() || null);
  }

  /** 管理端判定：需要 system:* 类权限。此处按角色/账号类型收口（权威角色由身份层给）。 */
  function requireAdmin(req, res) {
    const user = requireAuth(req, res);
    if (!user) return null;
    if (!isAdmin(user)) {
      send(res, 403, { error: '需要管理员权限', required: 'system:admin' });
      return null;
    }
    return user;
  }

  function isAdmin(user) {
    if (!user) return false;
    const roles = Array.isArray(user.roles) ? user.roles : [];
    return user.isAdmin === true || roles.includes('platform_admin') || roles.includes('admin');
  }

  // ── 案例库 ────────────────────────────────────────────────────────────
  const caseRow = (r) => ({
    id: r.id, title: r.title, question: r.question, aoi: r.aoi,
    data: p(r.data, []), processing: r.processing, outputs: p(r.outputs, []),
    provenance: r.provenance, bbox: p(r.bbox, null), status: r.status, runSpec: p(r.runSpec, null),
    ownerUserId: r.ownerUserId, geoCardId: r.geoCardId,
    createdAt: r.createdAt, updatedAt: r.updatedAt
  });

  function listCases({ status, ownerUserId } = {}) {
    const where = []; const args = [];
    if (status) { where.push('status = ?'); args.push(status); }
    if (ownerUserId) { where.push('ownerUserId = ?'); args.push(ownerUserId); }
    const sql = `SELECT * FROM cases ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY createdAt DESC`;
    return db.prepare(sql).all(...args).map(caseRow);
  }

  function upsertCase(body, user, existingId = null) {
    const now = nowIso();
    if (!body.title) throw Object.assign(new Error('title 必填'), { status: 422 });
    if (body.status && !CASE_STATES.includes(body.status)) {
      throw Object.assign(new Error(`status 必须是 ${CASE_STATES.join('/')}`), { status: 422 });
    }
    if (existingId) {
      const prev = db.prepare('SELECT * FROM cases WHERE id = ?').get(existingId);
      if (!prev) throw Object.assign(new Error('案例不存在'), { status: 404 });
      db.prepare(`UPDATE cases SET title=?, question=?, aoi=?, data=?, processing=?, outputs=?,
                  provenance=?, bbox=?, status=?, geoCardId=?, runSpec=?, updatedAt=? WHERE id=?`)
        .run(body.title, body.question ?? prev.question, body.aoi ?? prev.aoi,
          j(body.data ?? p(prev.data, [])), body.processing ?? prev.processing,
          j(body.outputs ?? p(prev.outputs, [])), body.provenance ?? prev.provenance,
          j(body.bbox ?? p(prev.bbox, null)), body.status ?? prev.status,
          body.geoCardId ?? prev.geoCardId, j(body.runSpec ?? p(prev.runSpec, null)), now, existingId);
      return caseRow(db.prepare('SELECT * FROM cases WHERE id = ?').get(existingId));
    }
    const caseId = body.id || id('case');
    db.prepare(`INSERT INTO cases (id, title, question, aoi, data, processing, outputs, provenance, bbox,
                status, ownerUserId, geoCardId, runSpec, createdAt, updatedAt)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(caseId, body.title, body.question || null, body.aoi || null, j(body.data || []),
        body.processing || null, j(body.outputs || []), body.provenance || 'archival',
        j(body.bbox || null), body.status || 'draft', user?.id || null, body.geoCardId || null,
        j(body.runSpec || null), now, now);
    return caseRow(db.prepare('SELECT * FROM cases WHERE id = ?').get(caseId));
  }

  // ── 审批 ──────────────────────────────────────────────────────────────
  const approvalRow = (r) => ({
    id: r.id, kind: r.kind, subjectId: r.subjectId, title: r.title, payload: p(r.payload, {}),
    status: r.status, submittedBy: r.submittedBy, submittedByEmail: r.submittedByEmail,
    decidedBy: r.decidedBy, decidedAt: r.decidedAt, note: r.note,
    sdkState: r.sdkState, sdkError: r.sdkError, createdAt: r.createdAt, updatedAt: r.updatedAt
  });

  function listApprovals({ status } = {}) {
    const rows = status
      ? db.prepare('SELECT * FROM approvals WHERE status = ? ORDER BY createdAt DESC').all(status)
      : db.prepare('SELECT * FROM approvals ORDER BY createdAt DESC').all();
    return rows.map(approvalRow);
  }

  /** 提交审批单：GeoCard 发布会同时提交到 SDK Registry（status=pending）。 */
  async function createApproval(body, user) {
    const kind = body.kind || 'geocard-publish';
    const now = nowIso();
    const approvalId = id('apv');
    let subjectId = body.subjectId || body.card?.id || approvalId;
    let sdkState = null; let sdkError = null; let status = 'pending';

    if (kind === 'geocard-publish') {
      if (!body.card || !body.card.id) {
        throw Object.assign(new Error('geocard-publish 需要 body.card（含 id）'), { status: 422 });
      }
      try {
        const res = await sdk.registerCard({ card: body.card, nodeUrl: body.nodeUrl || 'platform', status: 'pending' });
        sdkState = res?.entry?.status || 'pending';
      } catch (err) {
        sdkState = 'failed'; sdkError = err.message;
        // SDK 拒绝（如契约校验 422）时审批单不入队，直接把原因回给调用方
        if (err.status && err.status >= 400 && err.status < 500) {
          audit(user, 'geocard.publish', subjectId, { error: err.message }, 'failed');
          throw Object.assign(new Error(`SDK 拒绝该 GeoCard：${err.message}`), { status: err.status, detail: err.detail });
        }
      }
    }

    db.prepare(`INSERT INTO approvals (id, kind, subjectId, title, payload, status, submittedBy,
                submittedByEmail, sdkState, sdkError, createdAt, updatedAt)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(approvalId, kind, subjectId, body.title || body.card?.name || null, j(body), status,
        user?.id || null, user?.email || null, sdkState, sdkError, now, now);
    audit(user, 'approval.create', approvalId, { kind, subjectId, sdkState });
    return approvalRow(db.prepare('SELECT * FROM approvals WHERE id = ?').get(approvalId));
  }

  /** 裁决：approve/reject。GeoCard 类会把决定转发给 SDK，SDK 才是资产的最终状态。 */
  async function decideApproval(approvalId, decision, note, user) {
    const row = db.prepare('SELECT * FROM approvals WHERE id = ?').get(approvalId);
    if (!row) throw Object.assign(new Error('审批单不存在'), { status: 404 });
    if (row.status !== 'pending') throw Object.assign(new Error(`审批单已是 ${row.status}`), { status: 409 });
    if (!['approve', 'reject'].includes(decision)) {
      throw Object.assign(new Error('decision 必须是 approve|reject'), { status: 422 });
    }
    const now = nowIso();
    let sdkState = row.sdkState; let sdkError = null;
    if (row.kind === 'geocard-publish') {
      try {
        const res = decision === 'approve'
          ? await sdk.approve(row.subjectId, { note, by: user?.email || user?.id })
          : await sdk.reject(row.subjectId, { note, by: user?.email || user?.id });
        sdkState = res?.entry?.status || (decision === 'approve' ? 'approved' : 'rejected');
      } catch (err) {
        sdkError = err.message;
        audit(user, `approval.${decision}`, approvalId, { error: err.message }, 'failed');
        throw Object.assign(new Error(`转发 SDK 失败：${err.message}`), { status: 502, detail: err.detail });
      }
    }
    const status = decision === 'approve' ? 'approved' : 'rejected';
    db.prepare(`UPDATE approvals SET status=?, decidedBy=?, decidedAt=?, note=?, sdkState=?, sdkError=?, updatedAt=?
                WHERE id=?`).run(status, user?.email || user?.id || null, now, note || null, sdkState, sdkError, now, approvalId);
    audit(user, `approval.${decision}`, approvalId, { note, sdkState });
    return approvalRow(db.prepare('SELECT * FROM approvals WHERE id = ?').get(approvalId));
  }

  // ── 配额 ──────────────────────────────────────────────────────────────
  const quotaRow = (r) => ({
    id: r.id, scope: r.scope, subject: r.subject, period: r.period,
    limit: r.limitAmount, used: r.usedAmount, remaining: Math.max(0, r.limitAmount - r.usedAmount),
    unit: r.unit, updatedAt: r.updatedAt
  });

  function listQuotas({ scope, subject } = {}) {
    const where = []; const args = [];
    if (scope) { where.push('scope = ?'); args.push(scope); }
    if (subject) { where.push('subject = ?'); args.push(subject); }
    return db.prepare(`SELECT * FROM quotas ${where.length ? 'WHERE ' + where.join(' AND ') : ''}`)
      .all(...args).map(quotaRow);
  }

  function setQuota(body) {
    if (!body.scope || !body.subject) throw Object.assign(new Error('scope 与 subject 必填'), { status: 422 });
    const now = nowIso();
    const period = body.period || 'monthly';
    const existing = db.prepare('SELECT * FROM quotas WHERE scope = ? AND subject = ? AND period = ?')
      .get(body.scope, body.subject, period);
    if (existing) {
      db.prepare('UPDATE quotas SET limitAmount=?, unit=?, updatedAt=? WHERE id=?')
        .run(Number(body.limit ?? existing.limitAmount), body.unit || existing.unit, now, existing.id);
      return quotaRow(db.prepare('SELECT * FROM quotas WHERE id = ?').get(existing.id));
    }
    const quotaId = id('qta');
    db.prepare(`INSERT INTO quotas (id, scope, subject, period, limitAmount, usedAmount, unit, updatedAt)
                VALUES (?, ?, ?, ?, ?, 0, ?, ?)`)
      .run(quotaId, body.scope, body.subject, period, Number(body.limit ?? 0), body.unit || 'core-hour', now);
    return quotaRow(db.prepare('SELECT * FROM quotas WHERE id = ?').get(quotaId));
  }

  /** 扣减：部门与个人两级取小者生效（与 user-management.md §5.3 一致）。 */
  function consumeQuota({ subject, dept, amount, unit = 'core-hour' }) {
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) throw Object.assign(new Error('amount 必须为正数'), { status: 422 });
    const rows = [
      subject ? db.prepare("SELECT * FROM quotas WHERE scope='user' AND subject=?").get(subject) : null,
      dept ? db.prepare("SELECT * FROM quotas WHERE scope='dept' AND subject=?").get(dept) : null
    ].filter(Boolean);
    if (!rows.length) throw Object.assign(new Error('未配置配额'), { status: 404 });
    for (const r of rows) {
      if (r.usedAmount + amt > r.limitAmount) {
        throw Object.assign(new Error(`配额不足（${r.scope}:${r.subject} 剩余 ${(r.limitAmount - r.usedAmount).toFixed(2)} ${r.unit}）`),
          { status: 409, detail: { scope: r.scope, subject: r.subject, remaining: r.limitAmount - r.usedAmount } });
      }
    }
    const now = nowIso();
    for (const r of rows) db.prepare('UPDATE quotas SET usedAmount = usedAmount + ?, updatedAt = ? WHERE id = ?').run(amt, now, r.id);
    return { consumed: amt, unit, quotas: rows.map((r) => quotaRow(db.prepare('SELECT * FROM quotas WHERE id=?').get(r.id))) };
  }

  // ── 九大模块内容管理 ──────────────────────────────────────────────────
  const itemRow = (r) => ({
    id: r.id, module: r.module, title: r.title, summary: r.summary, body: p(r.body, null),
    link: r.link, tag: r.tag, sortOrder: r.sortOrder, visible: !!r.visible,
    createdAt: r.createdAt, updatedAt: r.updatedAt
  });

  function listModuleItems(module, { includeHidden = true } = {}) {
    if (!MODULES.includes(module)) throw Object.assign(new Error(`未知模块：${module}`), { status: 404 });
    const sql = includeHidden
      ? 'SELECT * FROM module_items WHERE module = ? ORDER BY sortOrder, createdAt'
      : 'SELECT * FROM module_items WHERE module = ? AND visible = 1 ORDER BY sortOrder, createdAt';
    return db.prepare(sql).all(module).map(itemRow);
  }

  function saveModuleItem(module, body, existingId = null) {
    if (!MODULES.includes(module)) throw Object.assign(new Error(`未知模块：${module}`), { status: 404 });
    if (!body.title) throw Object.assign(new Error('title 必填'), { status: 422 });
    const now = nowIso();
    if (existingId) {
      const prev = db.prepare('SELECT * FROM module_items WHERE id = ?').get(existingId);
      if (!prev) throw Object.assign(new Error('条目不存在'), { status: 404 });
      db.prepare(`UPDATE module_items SET title=?, summary=?, body=?, link=?, tag=?, sortOrder=?, visible=?, updatedAt=?
                  WHERE id=?`)
        .run(body.title, body.summary ?? prev.summary, j(body.body ?? p(prev.body, null)), body.link ?? prev.link,
          body.tag ?? prev.tag, Number(body.sortOrder ?? prev.sortOrder),
          body.visible === undefined ? prev.visible : (body.visible ? 1 : 0), now, existingId);
      return itemRow(db.prepare('SELECT * FROM module_items WHERE id = ?').get(existingId));
    }
    const itemId = id('mi');
    db.prepare(`INSERT INTO module_items (id, module, title, summary, body, link, tag, sortOrder, visible, createdAt, updatedAt)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(itemId, module, body.title, body.summary || null, j(body.body || null), body.link || null,
        body.tag || null, Number(body.sortOrder || 0), body.visible === false ? 0 : 1, now, now);
    return itemRow(db.prepare('SELECT * FROM module_items WHERE id = ?').get(itemId));
  }

  function deleteModuleItem(itemId) {
    const info = db.prepare('DELETE FROM module_items WHERE id = ?').run(itemId);
    if (!info.changes) throw Object.assign(new Error('条目不存在'), { status: 404 });
    return { deleted: itemId };
  }

  // ── 案例复跑（接 SDK 执行面）────────────────────────────────────────────
  //  链路：平台 POST /api/cases/:id/run → SDK Web BFF POST /api/execute（带 task_id）
  //        → 平台存 sdk_task_id → 轮询 GET /api/tasks/{id} → 终态取 result.outputs
  //  注意：执行面 8787 本身没有任务端点（同步 execute、无 task_id），所以必须走 Web BFF。

  /** SDK Web 的状态词 → GeoTask 契约的状态词（见 docs/GEOTASK.md 的投影表）。 */
  function normalizeStatus(sdkStatus) {
    return ({ queued: 'queued', running: 'running', done: 'succeeded', failed: 'failed', cancelled: 'cancelled' })[sdkStatus]
      || sdkStatus || 'queued';
  }

  const TERMINAL = new Set(['succeeded', 'failed', 'cancelled']);

  const runRow = (r) => ({
    id: r.id, caseId: r.caseId, sdkTaskId: r.sdkTaskId, skill: r.skill, params: p(r.params, {}),
    status: r.status, sdkStatus: r.sdkStatus, progress: r.progress ?? 0, message: r.message,
    outputs: p(r.outputs, null), error: r.error, createdBy: r.createdBy,
    createdAt: r.createdAt, updatedAt: r.updatedAt, finishedAt: r.finishedAt
  });

  function listRunsForCase(caseId) {
    return db.prepare('SELECT * FROM case_runs WHERE caseId = ? ORDER BY createdAt DESC').all(caseId).map(runRow);
  }

  function getRun(runId) {
    const r = db.prepare('SELECT * FROM case_runs WHERE id = ?').get(runId);
    return r ? runRow(r) : null;
  }

  /** 就地把非终态 run 与 SDK 对齐（读时轮询，避免后台定时器）。 */
  async function refreshRun(run) {
    if (!run.sdkTaskId || TERMINAL.has(run.status)) return run;
    try {
      const task = await sdkWeb.getTask(run.sdkTaskId);
      const sdkStatus = task?.status || run.sdkStatus;
      const status = normalizeStatus(sdkStatus);
      const outputs = task?.result?.outputs ? task.result.outputs : p(run.outputs, null);
      const error = task?.error || null;
      const finishedAt = TERMINAL.has(status) ? nowIso() : null;
      db.prepare(`UPDATE case_runs SET status=?, sdkStatus=?, progress=?, message=?, outputs=?, error=?,
                  finishedAt=COALESCE(?, finishedAt), updatedAt=? WHERE id=?`)
        .run(status, sdkStatus, Number(task?.progress ?? run.progress ?? 0), task?.message ?? run.message,
          outputs ? j(outputs) : null, error, finishedAt, nowIso(), run.id);
      return getRun(run.id);
    } catch (err) {
      // SDK 侧记录消失（BFF 重启会丢内存任务）→ 标为未知，提示可重跑，而不是假装还在跑
      if (err.status === 404) {
        db.prepare("UPDATE case_runs SET status='unknown', error=?, updatedAt=? WHERE id=?")
          .run('SDK 侧任务已不存在（Web BFF 重启会丢失内存任务），可重新复跑', nowIso(), run.id);
        return getRun(run.id);
      }
      return run;
    }
  }

  /** 提交一次复跑：案例必须已发布，且声明了 runSpec（skill + params）。 */
  async function startRun(caseRowIn, user) {
    if (caseRowIn.status !== 'published') {
      throw Object.assign(new Error('只有已发布的案例可以复跑'), { status: 409 });
    }
    const spec = p(caseRowIn.runSpec, null);
    if (!spec || !spec.skill) {
      throw Object.assign(new Error('该案例尚未声明复跑方式（runSpec.skill 为空）'),
        { status: 422, detail: { hint: '在案例上补 runSpec: {skill, params}，例如 {"skill":"ndvi-analysis","params":{"red":"…","nir":"…"}}' } });
    }
    let submitted;
    try {
      submitted = await sdkWeb.execute({ skill: spec.skill, params: spec.params || {}, nodeUrl: spec.nodeUrl });
    } catch (err) {
      audit(user, 'case.run', caseRowIn.id, { error: err.message }, 'failed');
      throw Object.assign(new Error(`提交 SDK 执行失败：${err.message}`),
        { status: err.status && err.status < 500 ? err.status : 502, detail: err.detail });
    }
    const runId = id('run');
    const now = nowIso();
    db.prepare(`INSERT INTO case_runs (id, caseId, sdkTaskId, skill, params, status, sdkStatus, progress,
                createdBy, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`)
      .run(runId, caseRowIn.id, submitted?.task_id || null, spec.skill, j(spec.params || {}),
        normalizeStatus(submitted?.status), submitted?.status || 'queued', user?.email || user?.id || null, now, now);
    audit(user, 'case.run', caseRowIn.id, { runId, skill: spec.skill, sdkTaskId: submitted?.task_id });
    return getRun(runId);
  }

  /** 产物下载：SDK 不提供文件服务，产物是执行面本地路径；这里做受控读取（白名单根 + 不可穿越）。 */
  function artifactPathFor(run, name) {
    // runRow 已经把 outputs 解析成对象；这里兼容"对象或 JSON 字符串"两种形态
    const outputs = (run.outputs && typeof run.outputs === 'object') ? run.outputs : (p(run.outputs, {}) || {});
    const raw = outputs[name];
    if (typeof raw !== 'string') throw Object.assign(new Error(`产物 ${name} 不存在或不是文件路径`), { status: 404 });
    const resolved = path.resolve(raw);
    const roots = String(process.env.ARTIFACT_ROOTS || `${ctx.uploadsDir || ''}:${process.env.SDK_WORKDIR || '/tmp/geonexus-exec'}`)
      .split(':').filter(Boolean).map((r) => path.resolve(r));
    const allowed = roots.some((root) => resolved === root || resolved.startsWith(root + path.sep));
    if (!allowed) {
      throw Object.assign(new Error('产物路径不在允许的根目录内（用 ARTIFACT_ROOTS 配置）'),
        { status: 403, detail: { resolved, roots } });
    }
    return resolved;
  }

  // ── 管理总览 ──────────────────────────────────────────────────────────
  async function adminOverview() {
    const count = (sql, ...a) => db.prepare(sql).get(...a).c;
    let sdkStatus = 'unknown'; let sdkCards = null; let sdkError = null;
    try {
      const cards = await sdk.listCards({ status: 'all' });
      sdkCards = cards?.count ?? 0; sdkStatus = 'up';
    } catch (err) { sdkStatus = 'down'; sdkError = err.message; }
    return {
      users: count('SELECT COUNT(*) AS c FROM users'),
      sessions: count('SELECT COUNT(*) AS c FROM sessions'),
      cases: count('SELECT COUNT(*) AS c FROM cases'),
      casesPublished: count("SELECT COUNT(*) AS c FROM cases WHERE status='published'"),
      approvalsPending: count("SELECT COUNT(*) AS c FROM approvals WHERE status='pending'"),
      approvalsTotal: count('SELECT COUNT(*) AS c FROM approvals'),
      moduleItems: count('SELECT COUNT(*) AS c FROM module_items'),
      quotas: listQuotas().length,
      auditEvents: count('SELECT COUNT(*) AS c FROM audit_events'),
      sdk: { status: sdkStatus, cards: sdkCards, error: sdkError, registry: sdk.registryUrl },
      modules: MODULES
    };
  }

  // ── 路由分派 ──────────────────────────────────────────────────────────
  return async function handle(req, res, url) {
    const seg = url.pathname.split('/').filter(Boolean);   // ['api','cases','x']
    const at = (i) => seg[i];
    const isApi = seg[0] === 'api';

    try {
      // 案例库
      if (isApi && at(1) === 'cases' && seg.length === 2 && req.method === 'GET') {
        const status = url.searchParams.get('status') || null;
        const items = listCases({ status });
        return send(res, 200, { items, count: items.length, source: 'platform-case-lib' }), true;
      }
      if (isApi && at(1) === 'cases' && seg.length === 2 && req.method === 'POST') {
        const user = requireAuth(req, res); if (!user) return true;
        const body = await readBody(req);
        const item = upsertCase(body, user);
        audit(user, 'case.create', item.id, { title: item.title });
        return send(res, 201, { item }), true;
      }
      if (isApi && at(1) === 'cases' && seg.length === 3) {
        const caseId = at(2);
        if (req.method === 'GET') {
          const row = db.prepare('SELECT * FROM cases WHERE id = ?').get(caseId);
          if (!row) return send(res, 404, { error: '案例不存在' }), true;
          return send(res, 200, { item: caseRow(row) }), true;
        }
        const user = requireAuth(req, res); if (!user) return true;
        if (req.method === 'PUT') {
          const item = upsertCase(await readBody(req), user, caseId);
          audit(user, 'case.update', caseId, { title: item.title });
          return send(res, 200, { item }), true;
        }
        if (req.method === 'DELETE') {
          db.prepare('DELETE FROM cases WHERE id = ?').run(caseId);
          audit(user, 'case.delete', caseId, null);
          return send(res, 200, { deleted: caseId }), true;
        }
      }
      // 案例复跑
      if (isApi && at(1) === 'cases' && seg.length === 4 && at(3) === 'run' && req.method === 'POST') {
        const user = requireAuth(req, res); if (!user) return true;
        const row = db.prepare('SELECT * FROM cases WHERE id = ?').get(at(2));
        if (!row) return send(res, 404, { error: '案例不存在' }), true;
        const run = await startRun(row, user);
        return send(res, 202, { run }), true;
      }
      if (isApi && at(1) === 'cases' && seg.length === 4 && at(3) === 'runs' && req.method === 'GET') {
        const rows = listRunsForCase(at(2));
        const refreshed = [];
        for (const r of rows) refreshed.push(await refreshRun(r));
        return send(res, 200, { items: refreshed, count: refreshed.length }), true;
      }
      if (isApi && at(1) === 'runs' && seg.length === 3 && req.method === 'GET') {
        const run = getRun(at(2));
        if (!run) return send(res, 404, { error: '运行记录不存在' }), true;
        return send(res, 200, { run: await refreshRun(run) }), true;
      }
      if (isApi && at(1) === 'runs' && seg.length === 4 && at(3) === 'cancel' && req.method === 'POST') {
        const user = requireAuth(req, res); if (!user) return true;
        const run = getRun(at(2));
        if (!run) return send(res, 404, { error: '运行记录不存在' }), true;
        try {
          await sdkWeb.cancelTask(run.sdkTaskId);
          audit(user, 'case.run.cancel', run.id, { sdkTaskId: run.sdkTaskId });
          return send(res, 200, { run: await refreshRun(run) }), true;
        } catch (err) {
          return send(res, err.status && err.status < 500 ? err.status : 502,
            { error: `取消失败：${err.message}`, detail: err.detail }), true;
        }
      }
      // 产物下载（受控：白名单根目录 + 拒绝穿越）
      if (isApi && at(1) === 'runs' && seg.length === 5 && at(3) === 'artifacts' && req.method === 'GET') {
        const user = requireAuth(req, res); if (!user) return true;
        const run = getRun(at(2));
        if (!run) return send(res, 404, { error: '运行记录不存在' }), true;
        try {
          const file = artifactPathFor(run, decodeURIComponent(at(4)));
          const fsMod = require('fs');
          if (!fsMod.existsSync(file)) return send(res, 404, { error: '产物文件不在磁盘上（可能已被清理）' }), true;
          const stat = fsMod.statSync(file);
          res.writeHead(200, {
            'content-type': file.endsWith('.json') ? 'application/json; charset=utf-8' : 'application/octet-stream',
            'content-length': stat.size,
            'content-disposition': `inline; filename="${path.basename(file)}"`
          });
          fsMod.createReadStream(file).pipe(res);
          return true;
        } catch (err) {
          return send(res, err.status || 500, { error: err.message, ...(err.detail ? { detail: err.detail } : {}) }), true;
        }
      }

      // SDK 案例（前端 /api/sdk/cases 落到平台案例库；只有已发布的才算"可复现"）
      if (isApi && at(1) === 'sdk' && at(2) === 'cases' && req.method === 'GET') {
        const items = listCases({ status: 'published' });
        return send(res, 200, { items, count: items.length, source: 'platform-case-lib' }), true;
      }

      // 审批
      if (isApi && at(1) === 'approvals' && seg.length === 2) {
        if (req.method === 'GET') {
          const user = requireAuth(req, res); if (!user) return true;
          const status = url.searchParams.get('status') || null;
          const items = listApprovals({ status });
          return send(res, 200, { items, count: items.length }), true;
        }
        if (req.method === 'POST') {
          const user = requireAuth(req, res); if (!user) return true;
          const item = await createApproval(await readBody(req), user);
          return send(res, 201, { item }), true;
        }
      }
      if (isApi && at(1) === 'approvals' && seg.length === 4 && at(3) === 'decide' && req.method === 'POST') {
        const user = requireAdmin(req, res); if (!user) return true;
        const body = await readBody(req);
        const item = await decideApproval(at(2), body.decision, body.note, user);
        return send(res, 200, { item }), true;
      }

      // 配额
      if (isApi && at(1) === 'quotas' && seg.length === 2) {
        if (req.method === 'GET') {
          const user = requireAuth(req, res); if (!user) return true;
          const items = listQuotas({ scope: url.searchParams.get('scope') || undefined, subject: url.searchParams.get('subject') || undefined });
          return send(res, 200, { items, count: items.length }), true;
        }
        if (req.method === 'POST') {
          const user = requireAdmin(req, res); if (!user) return true;
          const item = setQuota(await readBody(req));
          audit(user, 'quota.set', `${item.scope}:${item.subject}`, { limit: item.limit });
          return send(res, 201, { item }), true;
        }
      }
      if (isApi && at(1) === 'quotas' && at(2) === 'consume' && req.method === 'POST') {
        const user = requireAuth(req, res); if (!user) return true;
        const body = await readBody(req);
        const result = consumeQuota({ subject: body.subject || user.id, dept: body.dept, amount: body.amount, unit: body.unit });
        audit(user, 'quota.consume', `${body.subject || user.id}`, { amount: result.consumed });
        return send(res, 200, result), true;
      }

      // 后台：模块内容管理
      if (isApi && at(1) === 'admin' && at(2) === 'modules') {
        if (at(3) === undefined && req.method === 'GET') {
          const user = requireAdmin(req, res); if (!user) return true;
          const summary = MODULES.map((m) => ({ module: m, items: listModuleItems(m).length,
            visible: listModuleItems(m).filter((i) => i.visible).length }));
          return send(res, 200, { modules: summary }), true;
        }
        // 路径：/api/admin/modules/<module>/items[/<id>]
        const module = at(3);
        const hasItems = at(4) === 'items';
        if (seg.length === 5 && hasItems && req.method === 'GET') {
          const user = requireAdmin(req, res); if (!user) return true;
          const items = listModuleItems(module);
          return send(res, 200, { module, items, count: items.length }), true;
        }
        if (seg.length === 5 && hasItems && req.method === 'POST') {
          const user = requireAdmin(req, res); if (!user) return true;
          const item = saveModuleItem(module, await readBody(req));
          audit(user, 'module.item.create', `${module}:${item.id}`, { title: item.title });
          return send(res, 201, { item }), true;
        }
        if (seg.length === 6 && hasItems) {
          const itemId = at(5);
          if (req.method === 'PUT') {
            const user = requireAdmin(req, res); if (!user) return true;
            const item = saveModuleItem(module, await readBody(req), itemId);
            audit(user, 'module.item.update', `${module}:${itemId}`, { title: item.title });
            return send(res, 200, { item }), true;
          }
          if (req.method === 'DELETE') {
            const user = requireAdmin(req, res); if (!user) return true;
            const result = deleteModuleItem(itemId);
            audit(user, 'module.item.delete', `${module}:${itemId}`, null);
            return send(res, 200, result), true;
          }
        }
      }

      // 后台总览 / 审计
      if (isApi && at(1) === 'admin' && at(2) === 'overview' && req.method === 'GET') {
        const user = requireAdmin(req, res); if (!user) return true;
        return send(res, 200, await adminOverview()), true;
      }
      if (isApi && at(1) === 'admin' && at(2) === 'audit' && req.method === 'GET') {
        const user = requireAdmin(req, res); if (!user) return true;
        const limit = Math.min(Number(url.searchParams.get('limit') || 100), 500);
        const items = db.prepare('SELECT * FROM audit_events ORDER BY at DESC LIMIT ?').all(limit);
        return send(res, 200, { items, count: items.length }), true;
      }

      // SDK：目录（含审核状态过滤）与卡片发布/审核转发
      if (isApi && at(1) === 'sdk' && at(2) === 'geocards' && seg.length === 3) {
        const user = getAuthUser(req);
        const wantAll = url.searchParams.get('status');
        if (wantAll && !isAdmin(user)) {
          return send(res, 403, { error: '查看非公开状态需要管理员权限', required: 'system:admin' }), true;
        }
        const status = wantAll || 'approved';
        try {
          const upstream = await sdk.listCards({ status });
          const raw = Array.isArray(upstream?.cards) ? upstream.cards : [];
          const items = raw.map((e) => sdk.normalize(e));
          return send(res, 200, { items, count: items.length, source: 'sdk-registry',
            upstream: sdk.registryUrl, status, degraded: false }), true;
        } catch (err) {
          return send(res, 503, { error: `连不上 SDK Registry（${sdk.registryUrl}）：${err.message}`,
            source: 'sdk-registry', upstream: sdk.registryUrl,
            hint: '启动 SDK 侧注册中心，或设置 REGISTRY_URL 指向它' }), true;
        }
      }
      if (isApi && at(1) === 'sdk' && at(2) === 'geocards' && at(3) === 'publish' && req.method === 'POST') {
        const user = requireAuth(req, res); if (!user) return true;
        const item = await createApproval({ ...(await readBody(req)), kind: 'geocard-publish' }, user);
        return send(res, 201, { approval: item }), true;
      }
      if (isApi && at(1) === 'sdk' && at(2) === 'geocards' && seg.length === 5
          && ['approve', 'reject'].includes(at(4)) && req.method === 'POST') {
        const user = requireAdmin(req, res); if (!user) return true;
        const body = await readBody(req);
        const cardId = at(3);
        try {
          const res0 = at(4) === 'approve'
            ? await sdk.approve(cardId, { note: body.note, by: user.email || user.id })
            : await sdk.reject(cardId, { note: body.note, by: user.email || user.id });
          audit(user, `sdk.card.${at(4)}`, cardId, { note: body.note });
          return send(res, 200, { card: sdk.normalize(res0?.entry || {}), sdk: res0 }), true;
        } catch (err) {
          return send(res, err.status && err.status < 500 ? err.status : 502,
            { error: `转发 SDK 失败：${err.message}`, detail: err.detail }), true;
        }
      }
    } catch (err) {
      const status = err.status || 500;
      if (status >= 500 && logger) logger(`governance error: ${err.stack || err.message}`);
      return send(res, status, { error: err.message, ...(err.detail ? { detail: err.detail } : {}) }), true;
    }
    return false;
  };
}

module.exports = { createGovernance, MODULES, CASE_STATES, APPROVAL_STATES };
