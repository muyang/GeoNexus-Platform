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
// 可见性继承：规则镜像自 SDK 的 geonexus/geocard/visibility.py（理由见该文件注释）
const { evaluateVisibility, canSee, normalizeVisibility } = require('./visibility');

const CASE_STATES = ['draft', 'published', 'archived'];
const APPROVAL_STATES = ['pending', 'approved', 'rejected', 'withdrawn'];
/** 九大模块：与门户信息架构一一对应，后台按模块管理内容。 */
const MODULES = [
  'portal-home', 'visual-earth', 'global-cases', 'data-resources', 'operator-models',
  'compute-platform', 'open-community', 'super-agent', 'typical-apps'
];

function createGovernance(ctx) {
  const { db, send, readBody, requireAuth, getAuthUser, sdk, sdkWeb, recipes, uploadsDir, nowIso, logger } = ctx;
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
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updatedBy TEXT,
      updatedAt TEXT NOT NULL
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
    CREATE TABLE IF NOT EXISTS case_recipes (
      id TEXT PRIMARY KEY,
      caseId TEXT,
      recipeId TEXT NOT NULL,
      parentRecipeId TEXT,
      params TEXT NOT NULL DEFAULT '{}',
      paramContract TEXT NOT NULL DEFAULT '[]',
      deliverables TEXT NOT NULL DEFAULT '[]',
      -- 曾经用过的独立可见性列：**不再作为判定依据**（组合的可见性由组成项推出）。
      -- 留着是为了存量数据可读，写入时不再使用它，避免出现两套说法。
      visibility TEXT NOT NULL DEFAULT 'public',
      status TEXT NOT NULL DEFAULT 'pending',
      sdkStatus TEXT,
      sdkError TEXT,
      ownerUserId TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS deliverables (
      id TEXT PRIMARY KEY,
      runId TEXT,
      caseId TEXT,
      stepId TEXT,
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'knowledge',
      mediaType TEXT,
      ref TEXT,
      path TEXT,
      sizeBytes INTEGER,
      status TEXT NOT NULL DEFAULT 'declared',
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_deliverables_case ON deliverables(caseId);
    CREATE INDEX IF NOT EXISTS idx_deliverables_run ON deliverables(runId);
    CREATE INDEX IF NOT EXISTS idx_case_recipes_case ON case_recipes(caseId);
  `);

  try { db.exec('ALTER TABLE cases ADD COLUMN runSpec TEXT'); } catch { /* 列已存在 */ }
  // 资产的敏感档位：可见性继承要用它。缺省 restricted —— 缺省放开是访问控制里最常见的事故。
  try { db.exec("ALTER TABLE asset_cards ADD COLUMN sensitivity TEXT NOT NULL DEFAULT 'restricted'"); } catch { /* 列已存在 */ }
  // 案例自身的敏感档位。注意默认值不同：案例库是**平台编辑内容**，
  // 缺省 public；资产缺省 restricted。真正会泄露东西的是"组合"，不是编辑好的简介。
  try { db.exec("ALTER TABLE cases ADD COLUMN sensitivity TEXT"); } catch { /* 列已存在 */ }
  // 绑定方案时把方案全文存下来：组成项/步骤/requires 都要用它，
  // 而且之后算可见性不该再往 SDK 跑一趟。
  try { db.exec("ALTER TABLE case_recipes ADD COLUMN recipe TEXT"); } catch { /* 列已存在 */ }
  // 数据时间窗（与"这次什么时候跑的"是两件事：地图上的双时间轴要靠它）
  try { db.exec('ALTER TABLE cases ADD COLUMN temporal TEXT'); } catch { /* 列已存在 */ }
  // 运行记录归属哪个配方步骤：显式存字段，别再往 message 里塞（message 会被 SDK 的状态覆盖）
  try { db.exec('ALTER TABLE case_runs ADD COLUMN stepId TEXT'); } catch { /* 列已存在 */ }

  const j = (v) => JSON.stringify(v ?? null);
  // 宽松解析：空值给 fallback；**已经解析过的值原样返回**（否则 JSON.parse 一个数组会
  // 抛错并静默变成 fallback —— 这正是 bbox 在图层视图里丢失的原因）。
  const p = (v, fallback) => {
    if (v === null || v === undefined || v === '') return fallback;
    if (typeof v !== 'string') return v;
    try { return JSON.parse(v); } catch { return fallback; }
  };

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

  /** 细粒度权限：管理员通配；scopes 里带 * 或该 perm 即通过。 */
  function hasPerm(user, perm) {
    if (!perm) return true;
    if (isAdmin(user)) return true;
    const scopes = Array.isArray(user?.scopes) ? user.scopes : [];
    return scopes.includes('*') || scopes.includes(perm);
  }

  /** 需要登录 + 指定权限；不通过时已写好响应。 */
  function requirePerm(req, res, perm) {
    const user = requireAuth(req, res);
    if (!user) return null;
    if (!hasPerm(user, perm)) {
      send(res, 403, { error: `权限不足：需要 ${perm}`, required: perm });
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
    provenance: r.provenance, bbox: p(r.bbox, null), temporal: p(r.temporal, null),
    sensitivity: r.sensitivity || null,
    status: r.status, runSpec: p(r.runSpec, null),
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
                  provenance=?, bbox=?, temporal=?, sensitivity=?, status=?, geoCardId=?, runSpec=?,
                  updatedAt=? WHERE id=?`)
        .run(body.title, body.question ?? prev.question, body.aoi ?? prev.aoi,
          j(body.data ?? p(prev.data, [])), body.processing ?? prev.processing,
          j(body.outputs ?? p(prev.outputs, [])), body.provenance ?? prev.provenance,
          j(body.bbox ?? p(prev.bbox, null)), j(body.temporal ?? p(prev.temporal, null)),
          body.sensitivity ?? prev.sensitivity, body.status ?? prev.status,
          body.geoCardId ?? prev.geoCardId, j(body.runSpec ?? p(prev.runSpec, null)), now, existingId);
      return caseRow(db.prepare('SELECT * FROM cases WHERE id = ?').get(existingId));
    }
    const caseId = body.id || id('case');
    db.prepare(`INSERT INTO cases (id, title, question, aoi, data, processing, outputs, provenance, bbox,
                temporal, sensitivity, status, ownerUserId, geoCardId, runSpec, createdAt, updatedAt)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(caseId, body.title, body.question || null, body.aoi || null, j(body.data || []),
        body.processing || null, j(body.outputs || []), body.provenance || 'archival',
        j(body.bbox || null), j(body.temporal || null), body.sensitivity || null,
        body.status || 'draft', user?.id || null,
        body.geoCardId || null, j(body.runSpec || null), now, now);
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

    if (kind === 'recipe-publish') {
      // 方案比卡片更该过审：卡片是"这是什么"，方案是"别人会照着跑什么"。
      if (!body.recipe || !body.recipe.id) {
        throw Object.assign(new Error('recipe-publish 需要 body.recipe（含 id）'), { status: 422 });
      }
      subjectId = body.recipe.id;
      try {
        if (body.preRegistered) {
          // fork 的结果已经进了 SDK 目录（fork 即登记），再提交一次会 409。
          sdkState = 'pending';
        } else {
          const res = await recipes.registerRecipe(body.recipe, {
            status: 'pending', by: user?.email || user?.id, replace: Boolean(body.replace)
          });
          sdkState = (res?.entry || {}).status || 'pending';
        }
      } catch (err) {
        sdkState = 'failed'; sdkError = err.message;
        if (err.status && err.status >= 400 && err.status < 500) {
          audit(user, 'recipe.publish', subjectId, { error: err.message }, 'failed');
          throw Object.assign(new Error(`SDK 拒绝该方案：${err.message}`), { status: err.status, detail: err.detail });
        }
      }
      // 派生路径已经把绑定建好了（fork 一次只该产生一个绑定）；
      // 只有"直接发布到某个案例"时才在这里建。
      if (!body.bindingId && body.caseId) {
        const binding = bindRecipe({
          caseId: body.caseId, recipeId: subjectId, recipe: body.recipe,
          params: body.params || {}, status: 'pending'
        }, user);
        body.bindingId = binding.id;
      }
    }

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
    if (row.kind === 'geocard-publish' || row.kind === 'recipe-publish') {
      const client = row.kind === 'recipe-publish' ? recipes : sdk;
      const approve = row.kind === 'recipe-publish'
        ? (address, opts) => client.approveRecipe(address, opts)
        : (id, opts) => client.approve(id, opts);
      const reject = row.kind === 'recipe-publish'
        ? (address, opts) => client.rejectRecipe(address, opts)
        : (id, opts) => client.reject(id, opts);
      try {
        const res = decision === 'approve'
          ? await approve(row.subjectId, { note, by: user?.email || user?.id })
          : await reject(row.subjectId, { note, by: user?.email || user?.id });
        sdkState = res?.entry?.status || (decision === 'approve' ? 'approved' : 'rejected');
      } catch (err) {
        sdkError = err.message;
        audit(user, `approval.${decision}`, approvalId, { error: err.message }, 'failed');
        throw Object.assign(new Error(`转发 SDK 失败：${err.message}`), { status: 502, detail: err.detail });
      }
      // 平台侧绑定跟着 SDK 的裁决走：审批结果不能只存在于 SDK
      if (row.kind === 'recipe-publish') {
        const payload = p(row.payload, {}) || {};
        if (payload.bindingId) {
          db.prepare('UPDATE case_recipes SET status=?, sdkStatus=?, sdkError=?, updatedAt=? WHERE id=?')
            .run(sdkState, sdkState, sdkError, now, payload.bindingId);
        }
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
    id: r.id, caseId: r.caseId, sdkTaskId: r.sdkTaskId, skill: r.skill, stepId: r.stepId || null,
    params: p(r.params, {}),
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

  // ── 站点设置（前端行为由后台配置：地图引擎 / 底图 / 默认视角…）──────────
  const SETTING_DEFAULTS = {
    // 地图引擎：cesium（3D 地球，默认）| maplibre（矢量/栅格底图）
    'map.engine': 'cesium',
    'map.basemap': 'satellite',
    'map.projection': '3d',
    'map.homeView': JSON.stringify({ lon: 110, lat: 30, height: 20000000 }),
    'map.showGeoCards': 'true'
  };

  function getSettings() {
    const rows = db.prepare('SELECT key, value FROM settings').all();
    const map = { ...SETTING_DEFAULTS };
    for (const r of rows) if (r.key in SETTING_DEFAULTS) map[r.key] = r.value;
    let home = JSON.parse(SETTING_DEFAULTS['map.homeView']);
    try { home = JSON.parse(map['map.homeView']); } catch { /* 用默认 */ }
    return {
      'map.engine': map['map.engine'],
      'map.basemap': map['map.basemap'],
      'map.projection': map['map.projection'],
      'map.homeView': home,
      'map.showGeoCards': map['map.showGeoCards'] === 'true'
    };
  }

  function putSettings(patch, user) {
    if (!patch || typeof patch !== 'object') throw Object.assign(new Error('body 必须是对象'), { status: 422 });
    const allowed = new Set(Object.keys(SETTING_DEFAULTS));
    const unknown = Object.keys(patch).filter((k) => !allowed.has(k));
    if (unknown.length) {
      throw Object.assign(new Error(`不支持的设置项：${unknown.join(', ')}`),
        { status: 422, detail: { allowed: [...allowed] } });
    }
    if (patch['map.engine'] && !['cesium', 'maplibre'].includes(patch['map.engine'])) {
      throw Object.assign(new Error('map.engine 只能是 cesium 或 maplibre'), { status: 422 });
    }
    if (patch['map.projection'] && !['3d', '2d'].includes(patch['map.projection'])) {
      throw Object.assign(new Error('map.projection 只能是 3d 或 2d'), { status: 422 });
    }
    const now = nowIso();
    for (const [k, v] of Object.entries(patch)) {
      const value = typeof v === 'object' ? JSON.stringify(v) : String(v);
      db.prepare(`INSERT INTO settings (key, value, updatedBy, updatedAt) VALUES (?, ?, ?, ?)
                  ON CONFLICT(key) DO UPDATE SET value = excluded.value,
                    updatedBy = excluded.updatedBy, updatedAt = excluded.updatedAt`)
        .run(k, value, user?.email || user?.id || null, now);
    }
    audit(user, 'settings.update', Object.keys(patch).join(','), patch);
    return getSettings();
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

  // ══════════════════════════════════════════════════════════════════════
  //  可见性继承：组合案例不能成为绕过访问控制的捷径
  //  规则本身在 lib/visibility.js（与 SDK 同源），这里负责**解析组成项**。
  // ══════════════════════════════════════════════════════════════════════

  /** 已批准的目录（归一化成前端同一个形状）——可见性判定与列表共用一次结果。 */
  async function loadCatalogue() {
    try {
      const res = await sdk.listCards({ status: 'approved' });
      return (res?.cards || []).map((entry) => sdk.normalize(entry));
    } catch {
      return [];   // 目录不可达：组成项解析不到 ⇒ 保守（整案不可见）
    }
  }

  /** 资产 id → 档位。查不到返回 null（不存在与无权，对调用方是同一件事）。 */
  function componentVisibility(assetId, runtime = {}) {
    const cached = runtime.cache || (runtime.cache = new Map());
    if (cached.has(assetId)) return cached.get(assetId);
    let level = null;
    const local = db.prepare('SELECT sensitivity, status FROM asset_cards WHERE id = ?').get(assetId);
    if (local && local.status !== 'archived') {
      level = normalizeVisibility(local.sensitivity);
    } else {
      const fromCatalogue = (runtime.catalogue || []).find((card) => card.id === assetId);
      if (fromCatalogue) level = normalizeVisibility(fromCatalogue.visibility);
    }
    cached.set(assetId, level);
    return level;
  }

  /** 案例的组成项：来自绑定方案的步骤与 requires（方案怎么写的，就按什么算）。 */
  function caseComponents(caseId) {
    const binding = getCaseRecipe(caseId);
    if (!binding) return [];
    const recipe = binding.recipe || {};
    const declared = new Set(recipe.requires || []);
    const seen = new Set();
    const out = [];
    for (const step of recipe.steps || []) {
      const uses = step.uses;
      if (!uses || seen.has(uses)) continue;
      seen.add(uses);
      // 声明在 requires 里的算数据依赖；其余是真正干活的算子。
      out.push({ id: uses, role: declared.has(uses) ? 'data' : 'skill', step: step.id, required: true });
    }
    for (const ref of declared) {
      if (!seen.has(ref)) out.push({ id: ref, role: 'data', step: null, required: true });
    }
    return out;
  }

  /**
   * 算一个案例对外是否可见。
   *
   * 组合的档位由**组成项**决定；案例自己没有单独的敏感档位时按组成项的最严值走。
   * 组成项解析不到 ⇒ 整案不可见（对外 404，理由见 lib/visibility.js）。
   */
  async function caseVisibility(caseRowIn, { catalogue = null } = {}) {
    const components = caseComponents(caseRowIn.id);
    if (!components.length) {
      // 没有方案绑定：这是一条**平台编辑的案例简介**，没有组合，也就没有可泄露的
      // 组成项 —— 按编辑声明的档位走，缺省 public（否则访客什么都看不到，
      // 而"访客能浏览"是这个门户的前提）。
      return {
        visibility: normalizeVisibility(caseRowIn.sensitivity || 'public'),
        visible: true, levels: {}, missing: [], reason: ''
      };
    }
    const cards = catalogue === null ? await loadCatalogue() : catalogue;
    const runtime = { catalogue: cards };
    const evaluated = evaluateVisibility({
      // 案例自身的档位缺省是 public：案例库是**平台编辑内容**，真正会泄露东西的是
      // 组合（组成项）。编辑显式标了 restricted/sensitive 时才收紧。
      own: caseRowIn.sensitivity || 'public',
      components: components.map((c) => ({ ...c, visibility: componentVisibility(c.id, runtime) }))
    });
    return { ...evaluated, components };
  }

  /** 登录用户能看到的档位。管理员通配；其余由身份层给的 scope 决定。 */
  function grantedVisibilities(user) {
    if (!user) return ['public'];
    if (isAdmin(user)) return [...['public', 'restricted', 'sensitive', 'secret']];
    const scopes = Array.isArray(user.scopes) ? user.scopes : [];
    const granted = ['public'];
    for (const level of ['restricted', 'sensitive', 'secret']) {
      if (scopes.includes('*') || scopes.includes(`visibility:${level}`)) granted.push(level);
    }
    // 登录用户默认能看 restricted（机构内部资料），敏感/机密需显式 scope
    if (!granted.includes('restricted') && user.id) granted.push('restricted');
    return granted;
  }

  /** 案例对当前调用方是否可见：不可见时**不存在**（404），不是 403。 */
  async function requireVisibleCase(req, res, caseId, { catalogue = null } = {}) {
    const row = db.prepare('SELECT * FROM cases WHERE id = ?').get(caseId);
    if (!row) {
      send(res, 404, { error: '案例不存在' });
      return null;
    }
    const user = getAuthUser(req);
    const report = await caseVisibility(row, { catalogue });
    if (!report.visible || !canSee(report.visibility, grantedVisibilities(user))) {
      // 审计里记清楚"为什么被挡住"：哪一项、什么档位、调用方有什么档位。
      // 这是**管理面**信息（/api/admin/audit 需要权限），不会泄露给被拒的调用方。
      audit(user, 'case.hidden', caseId, {
        visibility: report.visibility, levels: report.levels, missing: report.missing,
        granted: grantedVisibilities(user)
      }, 'denied');
      // 404 而不是 403：403 等于承认"存在一个你看不到的案例"。
      send(res, 404, { error: '案例不存在' });
      return null;
    }
    return { row, report, user };
  }

  // ══════════════════════════════════════════════════════════════════════
  //  方案（Recipe）：目录 → 派生 → 物化 → 执行 → 交付物
  //  权威划分：参数契约与任务图来自 SDK（geo.plan），平台只做落地与呈现。
  // ══════════════════════════════════════════════════════════════════════

  const DELIVERABLE_ROLES = ['data', 'model', 'skill', 'agent', 'workflow', 'knowledge', 'compute'];

  const caseRecipeRow = (r) => ({
    id: r.id, caseId: r.caseId, recipeId: r.recipeId, parentRecipeId: r.parentRecipeId,
    params: p(r.params, {}), paramContract: p(r.paramContract, []), deliverables: p(r.deliverables, []),
    recipe: p(r.recipe, null),
    visibility: r.visibility, status: r.status, sdkStatus: r.sdkStatus, sdkError: r.sdkError,
    ownerUserId: r.ownerUserId, createdAt: r.createdAt, updatedAt: r.updatedAt
  });

  const deliverableRow = (r) => ({
    id: r.id, runId: r.runId, caseId: r.caseId, stepId: r.stepId, name: r.name, role: r.role,
    mediaType: r.mediaType, ref: r.ref, sizeBytes: r.sizeBytes, status: r.status,
    // 只暴露"有没有产物"，不暴露它落在磁盘的哪里：路径是运行环境的实现细节。
    hasArtifact: Boolean(r.path),
    createdAt: r.createdAt, updatedAt: r.updatedAt
  });

  function listCaseRecipes({ caseId = null, status = null } = {}) {
    const where = []; const args = [];
    if (caseId) { where.push('caseId = ?'); args.push(caseId); }
    if (status) { where.push('status = ?'); args.push(status); }
    const sql = `SELECT * FROM case_recipes ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY createdAt DESC`;
    return db.prepare(sql).all(...args).map(caseRecipeRow);
  }

  function getCaseRecipe(idOrCase) {
    const row = db.prepare('SELECT * FROM case_recipes WHERE id = ?').get(idOrCase)
      || db.prepare('SELECT * FROM case_recipes WHERE caseId = ? ORDER BY createdAt DESC').get(idOrCase);
    return row ? caseRecipeRow(row) : null;
  }

  /** 参数契约快照：把"这次能改什么"记在平台上，而不是每次去问 SDK。 */
  function contractOf(recipe) {
    return (recipe?.params || []).map((prm) => ({
      name: prm.name, type: prm.type || 'string', required: Boolean(prm.required),
      default: prm.default ?? null, enum: prm.enum || [],
      minimum: prm.minimum ?? null, maximum: prm.maximum ?? null,
      scope: prm.scope || 'reusable', description: prm.description || ''
    }));
  }

  function deliverableSpecsOf(recipe) {
    return (recipe?.outputs || []).map((o) => ({
      name: o.name, from: o.from, role: o.role || 'knowledge',
      mediaType: o.media_type || null, description: o.description || ''
    }));
  }

  /** 把一份方案绑定到案例上（派生或直接引用）。 */
  function bindRecipe({ caseId = null, recipeId, parentRecipeId = null, recipe = null, params = {}, status = 'pending' }, user) {
    const now = nowIso();
    const rowId = id('crp');
    db.prepare(`INSERT INTO case_recipes (id, caseId, recipeId, parentRecipeId, params, paramContract,
                deliverables, recipe, status, ownerUserId, createdAt, updatedAt)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(rowId, caseId, recipeId, parentRecipeId, j(params), j(contractOf(recipe)),
        j(deliverableSpecsOf(recipe)), j(recipe || null), status, user?.id || null, now, now);
    return caseRecipeRow(db.prepare('SELECT * FROM case_recipes WHERE id = ?').get(rowId));
  }

  /**
   * 列出方案：SDK 目录（权威） ∪ 平台绑定（本平台的案例）。
   * SDK 不可达时**不隐藏**平台侧数据，而是明确标出降级 —— 目录挂了不该让
   * 用户以为自己的案例也没了。
   */
  async function listRecipesMerged({ q = null, param = null, role = null, approvedOnly = true, caseId = null }) {
    const bindings = listCaseRecipes({ caseId });
    let catalogue = []; let sdkError = null;
    try {
      catalogue = await recipes.listRecipes({ approvedOnly, q, param, role });
    } catch (err) {
      sdkError = err.message;
    }
    const boundIds = new Set(bindings.map((b) => b.recipeId));
    // 目录条目**不因被谁绑定过就消失**：目录是"有什么可复用"，绑定是"我复用了哪个"。
    // 用 bound 标注两者关系，而不是让一边遮蔽另一边。
    const fromCatalogue = catalogue.map((r) => ({
      ...r, source: 'sdk-catalogue', bound: boundIds.has(r.id)
    }));
    return {
      items: [...bindings.map((b) => ({ ...b, source: 'platform-binding' })), ...fromCatalogue],
      catalogueCount: catalogue.length,
      bindingCount: bindings.length,
      sdk: { status: sdkError ? 'down' : 'up', error: sdkError, registry: recipes.registryUrl }
    };
  }

  function listDeliverables({ caseId = null, runId = null } = {}) {
    const where = []; const args = [];
    if (caseId) { where.push('caseId = ?'); args.push(caseId); }
    if (runId) { where.push('runId = ?'); args.push(runId); }
    const sql = `SELECT * FROM deliverables ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY createdAt DESC`;
    return db.prepare(sql).all(...args).map(deliverableRow);
  }

  function getDeliverable(deliverableId) {
    const row = db.prepare('SELECT * FROM deliverables WHERE id = ?').get(deliverableId);
    return row ? deliverableRow(row) : null;
  }

  /** 内部用：交付物的磁盘位置。公开视图刻意不带路径，读文件时单独取。 */
  function deliverableLocation(deliverableId) {
    const row = db.prepare('SELECT * FROM deliverables WHERE id = ?').get(deliverableId);
    return row ? { id: row.id, name: row.name, path: row.path, mediaType: row.mediaType } : null;
  }

  /** 交付物登记：路径来自执行面的产物，平台只记录并核对白名单。 */
  function recordDeliverables({ caseId, runId, stepId, outputs, specs }) {
    const now = nowIso();
    const created = [];
    for (const spec of specs || []) {
      const [fromStep, fromName] = String(spec.from || '').split('.');
      if (fromStep !== stepId) continue;
      const raw = outputs?.[fromName];
      const path = typeof raw === 'string' ? raw : (raw?.path || null);
      let sizeBytes = null;
      if (path) { try { sizeBytes = require('fs').statSync(path).size; } catch { /* 虚拟产物：没有实体文件 */ } }
      const rowId = id('dlv');
      db.prepare(`INSERT INTO deliverables (id, runId, caseId, stepId, name, role, mediaType, ref, path,
                  sizeBytes, status, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(rowId, runId, caseId, stepId, spec.name, spec.role || 'knowledge', spec.mediaType || null,
          `${stepId}.${fromName}`, path, sizeBytes, path ? 'ready' : 'declared', now, now);
      created.push(deliverableRow(db.prepare('SELECT * FROM deliverables WHERE id = ?').get(rowId)));
    }
    return created;
  }

  /**
   * 按 SDK 给的**任务图顺序**逐步执行，逐步登记运行记录。
   *
   *  这不是在平台里重写调度器：顺序、依赖、参数取值全部来自 geo.plan 的返回，
   *  平台只做两件 SDK 不该管的事 —— 用平台的凭据提交执行、把结果落成平台记录。
   *  上游产物的取值规则也来自方案自身：`step://s1/mask` 就是「s1 这一步的 mask 输出」。
   */
  async function executePlan({ plan, caseRowIn, user, recipeBindingId = null }) {
    const tasks = Array.isArray(plan?.tasks) ? plan.tasks : [];
    if (!tasks.length) throw Object.assign(new Error('任务图为空，无法执行'), { status: 422 });

    const runId = plan.run_id;
    const stepOutputs = {};        // stepId -> outputs 对象
    const stepRuns = {};           // stepId -> 平台 run 记录
    // deliverables 是 name→spec 的映射；补上 name 便于登记。
    // deliverables 是 name→spec 的映射；补上 name 并把 SDK 的 snake_case 归一化，
    // 免得媒体类型在平台侧悄悄变成 null（下载时就只能靠猜）。
    const namedSpecs = Object.entries(plan.deliverables || {}).map(([name, d]) => ({
      ...d, name, mediaType: d.media_type ?? d.mediaType ?? null
    }));

    for (const task of tasks) {
      const stepId = task.step || task.task_id;
      // 依赖必须在本次计划里且已完成；失败就让整次运行失败（半成品比没有更危险）。
      for (const dep of task.depends_on || []) {
        const depStep = String(dep).includes(':') ? String(dep).split(':').slice(1).join(':') : dep;
        const depRun = stepRuns[depStep];
        if (!depRun || depRun.status !== 'succeeded') {
          throw Object.assign(new Error(`步骤 ${stepId} 的上游 ${depStep} 未成功，已中止本次运行`),
            { status: 409, detail: { stepId, upstream: depStep, upstreamStatus: depRun?.status || 'missing' } });
        }
      }

      // 上一步的产物 → 这一步的输入（名字沿用方案里声明的输入名）。
      const wiring = {};
      for (const [name, ref] of Object.entries(task.inputs || {})) {
        const m = /^step:\/\/([^/]+)\/(.+)$/.exec(String(ref));
        if (!m) continue;
        const [, upStep, upField] = m;
        const value = stepOutputs[upStep]?.[upField];
        if (value === undefined) {
          throw Object.assign(new Error(`步骤 ${stepId} 需要 ${upStep} 的 ${upField}，但上游没有产出该字段`),
            { status: 409, detail: { stepId, ref } });
        }
        wiring[name] = value;
      }

      const params = { ...(task.params || {}), ...wiring };
      const now = nowIso();
      const platformRunId = id('run');
      db.prepare(`INSERT INTO case_runs (id, caseId, sdkTaskId, skill, stepId, params, status, sdkStatus,
                  progress, message, createdBy, createdAt, updatedAt)
                  VALUES (?, ?, ?, ?, ?, ?, 'queued', 'queued', 0, ?, ?, ?, ?)`)
        .run(platformRunId, caseRowIn.id, null, task.uses, stepId, j(params),
          `方案步骤 ${stepId}`, user?.email || user?.id || null, now, now);

      let submitted;
      try {
        submitted = await sdkWeb.execute({ skill: task.uses, params, nodeUrl: task.node_url });
      } catch (err) {
        db.prepare(`UPDATE case_runs SET status='failed', error=?, updatedAt=? WHERE id=?`)
          .run(`提交失败：${err.message}`, nowIso(), platformRunId);
        audit(user, 'recipe.run', caseRowIn.id, { stepId, error: err.message }, 'failed');
        throw Object.assign(new Error(`步骤 ${stepId} 提交失败：${err.message}`),
          { status: err.status && err.status < 500 ? err.status : 502, detail: err.detail });
      }
      db.prepare('UPDATE case_runs SET sdkTaskId=?, sdkStatus=?, updatedAt=? WHERE id=?')
        .run(submitted?.task_id || null, submitted?.status || 'queued', nowIso(), platformRunId);

      // 轮询到终态（读时对齐，与单技能复跑同一套 normalizeStatus）。
      let run = getRun(platformRunId);
      let guard = 0;
      while (run && !TERMINAL.has(run.status) && guard < 60) {
        run = await refreshRun(run);
        guard += 1;
      }
      if (!run || run.status !== 'succeeded') {
        audit(user, 'recipe.run', caseRowIn.id, { stepId, runId: platformRunId, status: run?.status }, 'failed');
        throw Object.assign(new Error(`步骤 ${stepId} 未成功（${run?.status || 'unknown'}）`),
          { status: 502, detail: { stepId, runId: platformRunId, sdkTaskId: run?.sdkTaskId } });
      }
      stepOutputs[stepId] = run.outputs || {};
      stepRuns[stepId] = run;
      recordDeliverables({
        caseId: caseRowIn.id, runId: platformRunId, stepId, outputs: run.outputs, specs: namedSpecs
      });
    }

    const finished = Object.values(stepRuns);
    audit(user, 'recipe.run', caseRowIn.id, {
      runId, steps: finished.length, binding: recipeBindingId
    });
    logger?.(`recipe run ${runId} finished with ${finished.length} step(s)`);
    return {
      runId,
      caseId: caseRowIn.id,
      steps: tasks.map((t) => t.step || t.task_id).map((s) => ({ step: s, runId: stepRuns[s].id, status: stepRuns[s].status })),
      deliverables: listDeliverables({ caseId: caseRowIn.id }).filter((d) => finished.some((r) => r.id === d.runId))
    };
  }

  /**
   * 案例图层：四级 LOD 的数据面。
   *
   *  L1 案例范围（AOI 面）→ L2 步骤足迹（时间 + 空间）→ L3 图层组 → L4 报告联动。
   *  平台只给**描述**，怎么画由前端决定（引擎可配：Cesium / MapLibre）。
   *  非空间案例也要有位置：它们属于侧栏，不属于地球 —— 所以 `spatial: false`。
   */
  function caseLayers(caseRowIn) {
    const binding = getCaseRecipe(caseRowIn.id);
    const runs = listRunsForCase(caseRowIn.id);
    const deliverables = listDeliverables({ caseId: caseRowIn.id });
    const bbox = p(caseRowIn.bbox, null);
    const spatial = Array.isArray(bbox) && bbox.length === 4;

    const layers = [];
    if (spatial) {
      layers.push({
        id: `${caseRowIn.id}:aoi`, level: 'L1', kind: 'aoi', name: caseRowIn.title,
        geometry: { type: 'bbox', bbox }, visible: true, opacity: 0.25
      });
    }
    // 倒序（列表按时间倒序返回）→ 正序，播放时才是 s1 → s2 → s3
    const stepFeet = [...runs].reverse().map((r) => ({
      runId: r.id,
      stepId: r.stepId || (r.message || '').replace(/^(recipe|方案步骤)\s+/, '') || null,
      skill: r.skill, status: r.status, startedAt: r.createdAt, finishedAt: r.finishedAt
    }));
    layers.push({
      id: `${caseRowIn.id}:steps`, level: 'L2', kind: 'step-footprint', name: '步骤足迹',
      steps: stepFeet, playback: stepFeet.length > 1, spatial
    });
    const groups = {};
    for (const d of deliverables) {
      const key = d.role === 'knowledge' ? 'knowledge' : 'data';
      (groups[key] = groups[key] || []).push({
        deliverableId: d.id, name: d.name, mediaType: d.mediaType, ref: d.ref, status: d.status
      });
    }
    layers.push({
      id: `${caseRowIn.id}:groups`, level: 'L3', kind: 'layer-group', name: '图层组',
      groups: Object.entries(groups).map(([role, items]) => ({ role, items }))
    });
    const report = deliverables.find((d) => d.role === 'knowledge');
    layers.push({
      id: `${caseRowIn.id}:report`, level: 'L4', kind: 'report-panel', name: '报告',
      deliverableId: report?.id || null, available: Boolean(report), linkage: 'on-select'
    });

    return {
      caseId: caseRowIn.id, title: caseRowIn.title, spatial, bbox: spatial ? bbox : null,
      provenance: caseRowIn.provenance,
      recipe: binding
        ? { recipeId: binding.recipeId, params: binding.params, contract: binding.paramContract, status: binding.status }
        : null,
      // 双时间轴：数据时间（案例声明的覆盖）与执行时间（这次运行）不是一回事。
      // 把两者分开，用户才能分辨"结果变了"是因为数据换了还是因为重跑过。
      timeline: {
        dataTime: p(caseRowIn.temporal, null),
        executionTime: runs.length
          ? { start: runs[runs.length - 1].createdAt, end: runs[0].finishedAt || runs[0].updatedAt }
          : null
      },
      layers
    };
  }

  // ── 路由分派 ──────────────────────────────────────────────────────────
  return async function handle(req, res, url) {
    const seg = url.pathname.split('/').filter(Boolean);   // ['api','cases','x']
    const at = (i) => seg[i];
    const isApi = seg[0] === 'api';

    try {
      // 案例库：不可见的案例**根本不出现**（不是出现后标记"你看不到"）
      if (isApi && at(1) === 'cases' && seg.length === 2 && req.method === 'GET') {
        const status = url.searchParams.get('status') || null;
        const all = listCases({ status });
        const user = getAuthUser(req);
        const granted = grantedVisibilities(user);
        const catalogue = await loadCatalogue();
        const items = [];
        const hidden = [];
        for (const item of all) {
          const report = await caseVisibility(
            db.prepare('SELECT * FROM cases WHERE id = ?').get(item.id), { catalogue }
          );
          if (report.visible && canSee(report.visibility, granted)) {
            items.push({ ...item, visibility: report.visibility });
          } else {
            hidden.push({ id: item.id, visibility: report.visibility, missing: report.missing });
          }
        }
        return send(res, 200, {
          items, count: items.length, hidden: hidden.length,
          source: 'platform-case-lib'
        }), true;
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
          const visible = await requireVisibleCase(req, res, caseId);
          if (!visible) return true;
          return send(res, 200, {
            item: { ...caseRow(visible.row), visibility: visible.report.visibility }
          }), true;
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
        const visible = await requireVisibleCase(req, res, at(2));
        if (!visible) return true;
        const run = await startRun(visible.row, user);
        return send(res, 202, { run }), true;
      }
      if (isApi && at(1) === 'cases' && seg.length === 4 && at(3) === 'runs' && req.method === 'GET') {
        const visible = await requireVisibleCase(req, res, at(2));
        if (!visible) return true;
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

      // ── 方案（Recipe）────────────────────────────────────────────── #
      //  目录权威在 SDK：平台列它、提交它、转发审批，但不复制它的语义。
      if (isApi && at(1) === 'recipes' && seg.length === 2 && req.method === 'GET') {
        const q = url.searchParams.get('q');
        const merged = await listRecipesMerged({
          q,
          param: url.searchParams.get('param'),
          role: url.searchParams.get('role'),
          caseId: url.searchParams.get('caseId'),
          approvedOnly: url.searchParams.get('all') !== 'true'
        });
        return send(res, 200, { ...merged, count: merged.items.length, source: 'sdk-catalogue+platform' }), true;
      }
      // 提交方案进 SDK 审核队列（与卡片发布同一条链路：pending → approved/rejected）
      if (isApi && at(1) === 'recipes' && seg.length === 2 && req.method === 'POST') {
        const user = requirePerm(req, res, 'geocard:publish'); if (!user) return true;
        const body = await readBody(req);
        if (!body?.recipe) return send(res, 422, { error: 'Body must contain recipe' }), true;
        // 发布方案 = 提交一张审批单：SDK 侧 pending，平台侧 pending，
        // 裁决时平台把决定转发给 SDK（与 GeoCard 发布完全同一条链路）。
        const approval = await createApproval({
          kind: 'recipe-publish',
          recipe: body.recipe,
          caseId: body.caseId || null,
          params: body.params || {},
          title: body.title || body.recipe.name || body.recipe.id,
          replace: Boolean(body.replace)
        }, user);
        const binding = approval.payload?.bindingId ? getCaseRecipe(approval.payload.bindingId) : null;
        return send(res, 201, { approval, binding }), true;
      }
      // 物化：只看不跑。参数契约错误原样带出字段名（前端据此高亮输入框）。
      if (isApi && at(1) === 'recipes' && seg.length === 3 && at(2) === 'plan' && req.method === 'POST') {
        const body = await readBody(req);
        if (!body?.recipe) return send(res, 422, { error: 'Body must contain recipe' }), true;
        try {
          const plan = await recipes.planRecipe({
            recipe: body.recipe, params: body.params || {},
            runId: body.runId || `plan-${Date.now()}`, nodeUrl: body.nodeUrl
          });
          return send(res, 200, { plan }), true;
        } catch (err) {
          return send(res, err.status || 502, {
            error: `物化失败：${err.message}`, code: err.code || null,
            field: err.field || null, detail: err.detail || null
          }), true;
        }
      }
      // 派生：新地址、新参数，源方案不动；同时在平台上生成一个待审的案例配方
      if (isApi && at(1) === 'recipes' && seg.length === 3 && at(2) === 'fork' && req.method === 'POST') {
        const user = requireAuth(req, res); if (!user) return true;
        const body = await readBody(req);
        if (!body?.recipe_id) return send(res, 422, { error: 'Body must contain recipe_id' }), true;
        try {
          const forked = await recipes.forkRecipe({
            recipeId: body.recipe_id, namespace: body.namespace, name: body.name, version: body.version,
            params: body.params || null, fixed: body.fixed || null, title: body.title || null
          });
          let caseId = body.caseId || null;
          if (!caseId && body.createCase !== false) {
            // 复用者要的是"我的案例"，不是"别人的配方"：顺手建一个草稿案例。
            const created = upsertCase({
              title: body.title || forked.recipe?.name || forked.id,
              status: 'draft',
              provenance: 'archival',
              question: body.question || null,
              bbox: body.bbox || null,
              // 数据时间窗由复用者声明：地图上要靠它区分"数据时间"与"执行时间"
              temporal: body.temporal || null,
              runSpec: null
            }, user);
            caseId = created.id;
          }
          const binding = bindRecipe({
            caseId, recipeId: forked.id, parentRecipeId: body.recipe_id,
            recipe: forked.recipe, params: body.params || {}, status: 'pending'
          }, user);
          // 派生件默认待审：这里生成审批单，让它在同一个"审批"页签里被裁决，
          // 而不是要求复用者去 SDK 注册中心手动批。
          const approval = await createApproval({
            kind: 'recipe-publish', recipe: forked.recipe, caseId,
            params: body.params || {}, title: forked.recipe?.name || forked.id,
            bindingId: binding.id, preRegistered: true
          }, user);
          audit(user, 'recipe.fork', forked.id, { from: body.recipe_id, caseId });
          return send(res, 201, { forked, binding, caseId, approval }), true;
        } catch (err) {
          audit(user, 'recipe.fork', body.recipe_id, { error: err.message }, 'failed');
          return send(res, err.status && err.status < 500 ? err.status : 502,
            { error: `派生失败：${err.message}`, detail: err.detail || null }), true;
        }
      }
      // 执行：先物化，再按任务图逐步提交（顺序与取值全部来自 SDK 的计划）
      if (isApi && at(1) === 'recipes' && seg.length === 3 && at(2) === 'run' && req.method === 'POST') {
        const user = requireAuth(req, res); if (!user) return true;
        const body = await readBody(req);
        const caseRowIn = body?.caseId
          ? db.prepare('SELECT * FROM cases WHERE id = ?').get(body.caseId)
          : null;
        if (!caseRowIn) return send(res, 404, { error: '案例不存在' }), true;
        if (caseRowIn.status !== 'published') {
          return send(res, 409, { error: '只有已发布的案例可以运行方案' }), true;
        }
        const binding = getCaseRecipe(caseRowIn.id);
        const recipeAddress = body.recipe || binding?.recipeId;
        if (!recipeAddress) return send(res, 422, { error: '案例尚未绑定方案，请先 fork 或绑定一个 recipe' }), true;
        const params = { ...(binding?.params || {}), ...(body.params || {}) };
        try {
          const plan = await recipes.planRecipe({
            recipe: recipeAddress, params, runId: body.runId || `run-${Date.now()}`,
            nodeUrl: body.nodeUrl
          });
          const result = await executePlan({ plan, caseRowIn, user, recipeBindingId: binding?.id || null });
          return send(res, 202, result), true;
        } catch (err) {
          // 2005 既可能是"没这个方案"也可能是"还没过审"（SDK 不区分）。平台手里有绑定状态，
          // 于是把**提示**补上 —— 注意这只翻译错误，不替 SDK 判定方案是否可用。
          const approvalHint = err.code === 2005 && binding && binding.status !== 'approved'
            ? `案例绑定的方案当前状态为 ${binding.status}；派生件需要先过审才能运行`
            : (err.code === 2005 ? '方案不存在或尚未批准（geo.plan 只物化已批准的方案）' : null);
          return send(res, err.status || 502, {
            error: err.message, code: err.code || null, field: err.field || null,
            detail: err.detail || null, hint: approvalHint
          }), true;
        }
      }

      // 案例图层（四级 LOD + 双时间轴的数据面）
      if (isApi && at(1) === 'cases' && seg.length === 4 && at(3) === 'layers' && req.method === 'GET') {
        const visible = await requireVisibleCase(req, res, at(2));
        if (!visible) return true;
        const view = caseLayers(caseRow(visible.row));
        view.visibility = visible.report;
        return send(res, 200, { view }), true;
      }
      if (isApi && at(1) === 'cases' && seg.length === 4 && at(3) === 'deliverables' && req.method === 'GET') {
        const visible = await requireVisibleCase(req, res, at(2));
        if (!visible) return true;
        const items = listDeliverables({ caseId: at(2) });
        return send(res, 200, { items, count: items.length }), true;
      }

      // 交付物：按 id 取报告（受控读取，与产物下载同一套白名单）
      if (isApi && at(1) === 'deliverables' && seg.length === 3 && req.method === 'GET') {
        const item = getDeliverable(at(2));
        if (!item) return send(res, 404, { error: '交付物不存在' }), true;
        if (item.caseId && !(await requireVisibleCase(req, res, item.caseId))) return true;
        return send(res, 200, { item }), true;
      }
      if (isApi && at(1) === 'deliverables' && seg.length === 4 && at(3) === 'report' && req.method === 'GET') {
        const user = requireAuth(req, res); if (!user) return true;
        const meta = getDeliverable(at(2));
        if (meta?.caseId && !(await requireVisibleCase(req, res, meta.caseId))) return true;
        const item = deliverableLocation(at(2));
        if (!item) return send(res, 404, { error: '交付物不存在' }), true;
        if (!item.path) {
          return send(res, 409, { error: '该交付物还没有产物文件（可能尚未运行或产物是虚拟的）' }), true;
        }
        try {
          const file = artifactPathFor({ outputs: { [item.name]: item.path } }, item.name);
          const fsMod = require('fs');
          if (!fsMod.existsSync(file)) return send(res, 404, { error: '产物文件不在磁盘上（可能已被清理）' }), true;
          const stat = fsMod.statSync(file);
          // 报告的媒体类型由方案声明；但**字符集必须显式带上** —— 报告里基本都有中文，
          // 让浏览器去猜就会渲染成乱码。声明了 charset 的按声明来。
          const declared = item.mediaType || (file.endsWith('.html') ? 'text/html'
            : file.endsWith('.json') ? 'application/json'
            : file.endsWith('.md') ? 'text/markdown' : 'application/octet-stream');
          const type = /^text\//.test(declared) && !/charset=/i.test(declared)
            ? `${declared}; charset=utf-8`
            : declared;
          res.writeHead(200, {
            'content-type': type, 'content-length': stat.size,
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
        const user = getAuthUser(req);
        const granted = grantedVisibilities(user);
        const catalogue = await loadCatalogue();
        const items = [];
        for (const item of listCases({ status: 'published' })) {
          const report = await caseVisibility(
            db.prepare('SELECT * FROM cases WHERE id = ?').get(item.id), { catalogue }
          );
          if (report.visible && canSee(report.visibility, granted)) {
            items.push({ ...item, visibility: report.visibility });
          }
        }
        return send(res, 200, { items, count: items.length, source: 'platform-case-lib' }), true;
      }

      // ── 后台：方案与交付物管理（页签数据面）──────────────────────── #
      if (isApi && at(1) === 'admin' && at(2) === 'recipes' && req.method === 'GET') {
        const user = requirePerm(req, res, 'approval:list'); if (!user) return true;
        const status = url.searchParams.get('status');
        const bindings = listCaseRecipes({ status });
        let catalogue = []; let sdkError = null;
        try {
          catalogue = await recipes.listRecipes({ status: status || null });
        } catch (err) { sdkError = err.message; }
        const pending = db.prepare("SELECT COUNT(*) AS c FROM approvals WHERE kind='recipe-publish' AND status='pending'").get().c;
        return send(res, 200, {
          bindings: bindings.map((b) => ({
            id: b.id, caseId: b.caseId, recipeId: b.recipeId, parentRecipeId: b.parentRecipeId,
            params: b.params, status: b.status, steps: (b.recipe?.steps || []).length,
            reusableParams: (b.paramContract || []).filter((c) => c.scope !== 'fixed').map((c) => c.name),
            fixedParams: (b.paramContract || []).filter((c) => c.scope === 'fixed').map((c) => c.name),
            deliverables: (b.deliverables || []).map((d) => d.name),
            createdAt: b.createdAt, updatedAt: b.updatedAt
          })),
          catalogue, bindingCount: bindings.length, catalogueCount: catalogue.length,
          pendingApprovals: pending,
          sdk: { status: sdkError ? 'down' : 'up', error: sdkError, registry: recipes.registryUrl }
        }), true;
      }
      if (isApi && at(1) === 'admin' && at(2) === 'deliverables' && req.method === 'GET') {
        const user = requirePerm(req, res, 'approval:list'); if (!user) return true;
        const caseId = url.searchParams.get('caseId');
        const role = url.searchParams.get('role');
        const items = listDeliverables({ caseId }).filter((d) => !role || d.role === role);
        const byRole = {};
        for (const item of items) byRole[item.role] = (byRole[item.role] || 0) + 1;
        const runs = db.prepare('SELECT COUNT(*) AS c FROM case_runs').get().c;
        return send(res, 200, {
          items, count: items.length, byRole, runs,
          cases: db.prepare('SELECT COUNT(DISTINCT caseId) AS c FROM deliverables').get().c
        }), true;
      }

      // 审批
      if (isApi && at(1) === 'approvals' && seg.length === 2) {
        if (req.method === 'GET') {
          // 全量审批列表属于管理动作：需要 approval:list（平台运营/管理员）
          const user = requirePerm(req, res, 'approval:list'); if (!user) return true;
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
      // 个人中心用：只看自己提交的申请（登录即可，不需要 approval:list）
      if (isApi && at(1) === 'approvals' && at(2) === 'mine' && req.method === 'GET') {
        const user = requireAuth(req, res); if (!user) return true;
        const mine = listApprovals({}).filter((a) => a.submittedByEmail && a.submittedByEmail === user.email);
        return send(res, 200, { items: mine, count: mine.length }), true;
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
          const scope = url.searchParams.get('scope') || undefined;
          const subject = url.searchParams.get('subject') || undefined;
          if (hasPerm(user, 'quota:read')) {
            const items = listQuotas({ scope, subject });
            return send(res, 200, { items, count: items.length, all: true }), true;
          }
          // 无 quota:read：只能看自己的个人配额（不看部门总额，那属于管理信息）
          const mine = listQuotas({ scope: 'user', subject: user.email });
          return send(res, 200, { items: mine, count: mine.length, all: false }), true;
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
        const subject = body.subject || user.email || user.id;
        if (subject !== (user.email || user.id) && !hasPerm(user, 'quota:read')) {
          return send(res, 403, { error: '只能扣减自己的配额', required: 'quota:read' }), true;
        }
        const result = consumeQuota({ subject, dept: body.dept, amount: body.amount, unit: body.unit });
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

      // 站点设置：读公开（前端要知道用哪个引擎），写需管理员
      if (isApi && at(1) === 'settings' && seg.length === 2) {
        if (req.method === 'GET') return send(res, 200, getSettings()), true;
        if (req.method === 'PUT' || req.method === 'POST') {
          const user = requireAdmin(req, res); if (!user) return true;
          return send(res, 200, putSettings(await readBody(req), user)), true;
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
