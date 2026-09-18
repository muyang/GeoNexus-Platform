const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const UPLOADS_DIR = path.join(ROOT, 'uploads');
const DB_PATH = path.join(DATA_DIR, 'geonexus.db');
const SEED_PATH = path.join(DATA_DIR, 'registry.json');
const START_PORT = Number(process.env.PORT || 3100);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS nodes (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      region TEXT NOT NULL,
      status TEXT NOT NULL,
      latencyClass TEXT NOT NULL,
      trustLevel TEXT NOT NULL,
      policyId TEXT,
      capabilities TEXT NOT NULL,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS capabilities (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      provider TEXT NOT NULL,
      nodeId TEXT NOT NULL,
      regions TEXT NOT NULL,
      triggers TEXT NOT NULL,
      inputs TEXT NOT NULL,
      outputs TEXT NOT NULL,
      tags TEXT NOT NULL,
      trustLevel TEXT NOT NULL,
      latencyClass TEXT NOT NULL,
      status TEXT NOT NULL,
      description TEXT NOT NULL,
      dependencies TEXT,
      agentId TEXT,
      graphX REAL,
      graphY REAL,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS data_products (
      id TEXT PRIMARY KEY,
      capabilityId TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      provider TEXT NOT NULL,
      nodeId TEXT NOT NULL,
      region TEXT NOT NULL,
      geometryType TEXT NOT NULL,
      temporalCoverage TEXT NOT NULL,
      accessUrl TEXT NOT NULL,
      license TEXT NOT NULL,
      policyId TEXT NOT NULL,
      rawDataExport INTEGER NOT NULL,
      derivedOutputs TEXT NOT NULL,
      tags TEXT NOT NULL,
      description TEXT NOT NULL,
      status TEXT NOT NULL,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(capabilityId) REFERENCES capabilities(id)
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      passwordHash TEXT NOT NULL,
      salt TEXT NOT NULL,
      org TEXT NOT NULL,
      createdAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      expiresAt TEXT NOT NULL,
      FOREIGN KEY(userId) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS asset_cards (
      id TEXT PRIMARY KEY,
      capabilityId TEXT NOT NULL UNIQUE,
      ownerUserId TEXT NOT NULL,
      assetKind TEXT NOT NULL,
      title TEXT NOT NULL,
      provider TEXT NOT NULL,
      nodeId TEXT NOT NULL,
      region TEXT NOT NULL,
      accessUrl TEXT NOT NULL,
      license TEXT NOT NULL,
      policyId TEXT NOT NULL,
      rawDataExport INTEGER NOT NULL,
      inputs TEXT NOT NULL,
      outputs TEXT NOT NULL,
      tags TEXT NOT NULL,
      description TEXT NOT NULL,
      status TEXT NOT NULL,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(ownerUserId) REFERENCES users(id),
      FOREIGN KEY(capabilityId) REFERENCES capabilities(id)
    );

    CREATE TABLE IF NOT EXISTS relations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sourceId TEXT NOT NULL,
      targetId TEXT NOT NULL,
      label TEXT NOT NULL,
      createdAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      region TEXT NOT NULL,
      hazard TEXT NOT NULL,
      mission TEXT NOT NULL,
      requestedBy TEXT NOT NULL,
      status TEXT NOT NULL,
      capabilities TEXT NOT NULL,
      outputs TEXT NOT NULL,
      nodeId TEXT NOT NULL,
      policyId TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      taskId TEXT,
      mission TEXT NOT NULL,
      status TEXT NOT NULL,
      progress INTEGER NOT NULL,
      planJson TEXT NOT NULL,
      startedAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY(taskId) REFERENCES tasks(id)
    );

    CREATE TABLE IF NOT EXISTS job_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      jobId TEXT NOT NULL,
      ts TEXT NOT NULL,
      message TEXT NOT NULL,
      FOREIGN KEY(jobId) REFERENCES jobs(id)
    );

    CREATE TABLE IF NOT EXISTS postcard_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      frontImage TEXT,
      backTemplate TEXT,
      width INTEGER DEFAULT 0,
      height INTEGER DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      sortOrder INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS stamp_groups (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      sortOrder INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS stamps (
      id TEXT PRIMARY KEY,
      groupId TEXT NOT NULL,
      name TEXT NOT NULL,
      imagePath TEXT,
      sortOrder INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(groupId) REFERENCES stamp_groups(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS postmark_groups (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      sortOrder INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS postmarks (
      id TEXT PRIMARY KEY,
      groupId TEXT NOT NULL,
      name TEXT NOT NULL,
      imagePath TEXT,
      sortOrder INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(groupId) REFERENCES postmark_groups(id) ON DELETE CASCADE
    );
  `);
}

function parseJson(value, fallback = []) {
  if (value == null || value === '') return fallback;
  return typeof value === 'string' ? JSON.parse(value) : value;
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const passwordHash = crypto.pbkdf2Sync(String(password), salt, 120000, 32, 'sha256').toString('hex');
  return { salt, passwordHash };
}

function publicUser(row) {
  if (!row) return null;
  return { id: row.id, name: row.name, email: row.email, org: row.org, createdAt: row.createdAt };
}

function createSession(userId) {
  const token = `gnx_${crypto.randomBytes(24).toString('hex')}`;
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  db.prepare('INSERT INTO sessions (token, userId, expiresAt) VALUES (?, ?, ?)').run(token, userId, expiresAt);
  return { token, expiresAt };
}

function getAuthUser(req) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return null;
  const row = db.prepare(`
    SELECT users.* FROM sessions
    JOIN users ON users.id = sessions.userId
    WHERE sessions.token = ? AND sessions.expiresAt > datetime('now')
  `).get(token);
  return row || null;
}

function requireAuth(req, res) {
  const user = getAuthUser(req);
  if (!user) {
    send(res, 401, { error: 'Authentication required' });
    return null;
  }
  return user;
}

function seedFromJson() {
  const count = db.prepare('SELECT COUNT(*) AS count FROM capabilities').get().count;
  if (count > 0) return;

  const seed = JSON.parse(fs.readFileSync(SEED_PATH, 'utf8'));
  const insertNode = db.prepare(`
    INSERT INTO nodes (id, name, region, status, latencyClass, trustLevel, policyId, capabilities, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertCapability = db.prepare(`
    INSERT INTO capabilities (
      id, name, type, provider, nodeId, regions, triggers, inputs, outputs, tags, trustLevel,
      latencyClass, status, description, dependencies, agentId, graphX, graphY, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertRelation = db.prepare(`
    INSERT INTO relations (sourceId, targetId, label, createdAt)
    VALUES (?, ?, ?, ?)
  `);

  const now = new Date().toISOString();
  const nodeIds = new Set();

  for (const node of seed.nodes) {
    nodeIds.add(node.id);
    insertNode.run(
      node.id,
      node.name,
      node.region,
      node.status,
      node.latencyClass,
      node.trustLevel,
      node.policyId,
      JSON.stringify(node.capabilities || []),
      now,
      now,
    );
  }

  for (const cap of seed.capabilities) {
    insertCapability.run(
      cap.id,
      cap.name,
      cap.type,
      cap.provider,
      cap.nodeId,
      JSON.stringify(cap.regions || []),
      JSON.stringify(cap.triggers || []),
      JSON.stringify(cap.inputs || []),
      JSON.stringify(cap.outputs || []),
      JSON.stringify(cap.tags || []),
      cap.trustLevel,
      cap.latencyClass,
      cap.status,
      cap.description,
      JSON.stringify(cap.dependencies || []),
      cap.agentId || null,
      cap.graph?.x ?? null,
      cap.graph?.y ?? null,
      now,
      now,
    );
  }

  for (const rel of seed.relations) {
    insertRelation.run(rel.from, rel.to, rel.label, now);
  }

  const taskInsert = db.prepare(`
    INSERT INTO tasks (id, title, region, hazard, mission, requestedBy, status, capabilities, outputs, nodeId, policyId, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const taskSeed = [
    {
      id: 'task.mekong-flood-01',
      title: 'Mekong Delta Flood Impact Assessment',
      region: 'Southeast Asia',
      hazard: 'flood',
      mission: 'Assess flood extent, impacted population, and crop loss for the Mekong Delta over the last 14 days.',
      requestedBy: 'Disaster Response Desk',
      status: 'ready',
      capabilities: ['skill.flood-impact-analysis', 'data.sentinel-water-extent', 'model.flood-segmentation-v2'],
      outputs: ['flood_map', 'affected_population', 'crop_loss_estimate', 'report'],
      nodeId: 'node.mekong',
      policyId: 'policy.data-sovereignty-asean',
    },
    {
      id: 'task.punjab-crop-02',
      title: 'Punjab Crop Stress Monitor',
      region: 'South Asia',
      hazard: 'agriculture stress',
      mission: 'Detect vegetation stress and produce NDVI summaries for Punjab fields this month.',
      requestedBy: 'Agriculture Program',
      status: 'ready',
      capabilities: ['skill.ndvi-crop-monitoring'],
      outputs: ['ndvi_timeseries', 'stress_zones', 'field_summary'],
      nodeId: 'node.punjab',
      policyId: 'policy.data-sovereignty-global',
    },
    {
      id: 'task.nairobi-heat-03',
      title: 'Nairobi Urban Heat Risk Review',
      region: 'East Africa',
      hazard: 'heat risk',
      mission: 'Score urban heat exposure and produce mitigation zones for Nairobi neighborhoods.',
      requestedBy: 'Climate City Network',
      status: 'ready',
      capabilities: ['skill.urban-heat-risk'],
      outputs: ['heat_risk_map', 'vulnerable_blocks', 'mitigation_zones'],
      nodeId: 'node.nairobi',
      policyId: 'policy.data-sovereignty-global',
    },
  ];

  for (const task of taskSeed) {
    taskInsert.run(
      task.id,
      task.title,
      task.region,
      task.hazard,
      task.mission,
      task.requestedBy,
      task.status,
      JSON.stringify(task.capabilities),
      JSON.stringify(task.outputs),
      task.nodeId,
      task.policyId,
      now,
      now,
    );
  }
}

function seedDataProducts() {
  const count = db.prepare('SELECT COUNT(*) AS count FROM data_products').get().count;
  if (count > 0) return;

  saveDataProduct({
    id: 'data_product.mekong-flood-depth-cog',
    capabilityId: 'data.mekong-flood-depth-cog',
    title: 'Mekong Derived Flood Depth COG',
    provider: 'Mekong GeoNode',
    nodeId: 'node.mekong',
    region: 'Southeast Asia',
    geometryType: 'raster-cog',
    temporalCoverage: '2026-05-12/latest',
    accessUrl: 'http://localhost:8100/assets/cogs/mekong_flood_map_derived_cog.tif',
    license: 'Derived output only',
    policyId: 'policy.data-sovereignty-asean',
    rawDataExport: false,
    derivedOutputs: ['derived_map', 'aggregate_statistics', 'risk_summary'],
    tags: ['flood', 'cog', 'raster', 'mekong', 'derived-output'],
    description: 'Derived flood-depth COG generated by the Mekong GeoNode Runtime with range-read support and COG validation.',
  });

  saveDataProduct({
    id: 'data_product.sentinel-water-extent-feed',
    capabilityId: 'data.sentinel-water-extent-feed-product',
    title: 'Sentinel Water Extent STAC Feed',
    provider: 'Open EO Mirror',
    nodeId: 'node.mekong',
    region: 'Southeast Asia',
    geometryType: 'stac-raster-collection',
    temporalCoverage: 'rolling_14_days',
    accessUrl: 'http://localhost:8100/stac/items/mekong-flood-depth-sample',
    license: 'CC-BY-4.0',
    policyId: 'policy.data-sovereignty-asean',
    rawDataExport: false,
    derivedOutputs: ['water_extent_summary', 'derived_map', 'confidence_mask'],
    tags: ['sentinel', 'water', 'stac', 'flood'],
    description: 'STAC-described water extent feed for flood response workflows and local GeoSkill execution.',
  });
}

initSchema();
seedFromJson();
seedDataProducts();

const jobTimers = new Map();

function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(JSON.stringify(body, null, 2));
}

function notFound(res) {
  send(res, 404, { error: 'Not found' });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function parseMultipart(buffer, contentType) {
  const match = contentType.match(/boundary=([^;]+)/);
  if (!match) return { fields: {}, files: [] };
  const boundary = Buffer.from(`--${match[1].trim()}`);
  const parts = [];
  let start = 0;
  while (true) {
    const idx = buffer.indexOf(boundary, start);
    if (idx === -1) break;
    const end = buffer.indexOf(boundary, idx + boundary.length);
    if (end === -1) break;
    const part = buffer.slice(idx + boundary.length + 2, end - 2);
    parts.push(part);
    start = end;
  }

  const result = { fields: {}, files: [] };
  for (const part of parts) {
    const headerEnd = part.indexOf(Buffer.from('\r\n\r\n'));
    if (headerEnd === -1) continue;
    const header = part.slice(0, headerEnd).toString('utf8');
    const data = part.slice(headerEnd + 4, part.length - 2);

    const disposition = header.match(/Content-Disposition:[^\r\n]+/i);
    if (!disposition) continue;

    const nameMatch = header.match(/name="([^"]+)"/);
    const filenameMatch = header.match(/filename="([^"]+)"/);
    const name = nameMatch ? nameMatch[1] : 'field';

    if (filenameMatch) {
      result.files.push({ fieldName: name, filename: filenameMatch[1], data });
    } else {
      result.fields[name] = data.toString('utf8');
    }
  }
  return result;
}

function generateId(prefix) {
  return `${prefix}.${crypto.randomBytes(4).toString('hex')}`;
}

function nowIso() {
  return new Date().toISOString();
}

function loadPostcardTemplates() {
  return db.prepare('SELECT * FROM postcard_templates ORDER BY sortOrder, createdAt').all();
}

function loadStampGroups() {
  return db.prepare('SELECT * FROM stamp_groups ORDER BY sortOrder, createdAt').all();
}

function loadStamps(groupId = null) {
  const sql = groupId
    ? 'SELECT * FROM stamps WHERE groupId = ? ORDER BY sortOrder, createdAt'
    : 'SELECT * FROM stamps ORDER BY sortOrder, createdAt';
  const stmt = db.prepare(sql);
  return groupId ? stmt.all(groupId) : stmt.all();
}

function loadPostmarkGroups() {
  return db.prepare('SELECT * FROM postmark_groups ORDER BY sortOrder, createdAt').all();
}

function loadPostmarks(groupId = null) {
  const sql = groupId
    ? 'SELECT * FROM postmarks WHERE groupId = ? ORDER BY sortOrder, createdAt'
    : 'SELECT * FROM postmarks ORDER BY sortOrder, createdAt';
  const stmt = db.prepare(sql);
  return groupId ? stmt.all(groupId) : stmt.all();
}

function savePostcardTemplate(body, id = null) {
  const templateId = id || generateId('template');
  const existing = id ? db.prepare('SELECT * FROM postcard_templates WHERE id = ?').get(id) : null;
  if (id && !existing) return null;
  let sortOrder;
  if (body.sortOrder !== undefined) {
    sortOrder = body.sortOrder;
  } else if (existing?.sortOrder !== undefined && existing.sortOrder !== null) {
    sortOrder = existing.sortOrder;
  } else {
    const maxRow = db.prepare('SELECT MAX(sortOrder) as maxSort FROM postcard_templates').get();
    sortOrder = (maxRow?.maxSort ?? -1) + 1;
  }
  const sql = `INSERT OR REPLACE INTO postcard_templates (id, name, description, frontImage, backTemplate, width, height, status, sortOrder, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  const createdAt = existing?.createdAt || nowIso();
  db.prepare(sql).run(templateId, body.name || existing?.name || 'Untitled', body.description || existing?.description || '', body.frontImage || existing?.frontImage || '', body.backTemplate || existing?.backTemplate || '', body.width || existing?.width || 0, body.height || existing?.height || 0, body.status || existing?.status || 'active', sortOrder, createdAt, nowIso());
  return db.prepare('SELECT * FROM postcard_templates WHERE id = ?').get(templateId);
}

function saveStampGroup(body, id = null) {
  const groupId = id || generateId('stamp_group');
  const existing = id ? db.prepare('SELECT * FROM stamp_groups WHERE id = ?').get(id) : null;
  if (id && !existing) return null;
  const sql = `INSERT OR REPLACE INTO stamp_groups (id, name, description, sortOrder, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)`;
  const createdAt = existing?.createdAt || nowIso();
  const sortOrder = body.sortOrder !== undefined ? body.sortOrder : (existing?.sortOrder || 0);
  db.prepare(sql).run(groupId, body.name || existing?.name || 'Untitled', body.description || existing?.description || '', sortOrder, createdAt, nowIso());
  return db.prepare('SELECT * FROM stamp_groups WHERE id = ?').get(groupId);
}

function saveStamp(body, id = null) {
  const stampId = id || generateId('stamp');
  const existing = id ? db.prepare('SELECT * FROM stamps WHERE id = ?').get(id) : null;
  if (id && !existing) return null;
  let sortOrder;
  if (body.sortOrder !== undefined) {
    sortOrder = body.sortOrder;
  } else if (existing?.sortOrder !== undefined && existing.sortOrder !== null) {
    sortOrder = existing.sortOrder;
  } else {
    const maxRow = db.prepare('SELECT MAX(sortOrder) as maxSort FROM stamps WHERE groupId = ?').get(body.groupId || existing?.groupId || '');
    sortOrder = (maxRow?.maxSort ?? -1) + 1;
  }
  const sql = `INSERT OR REPLACE INTO stamps (id, groupId, name, imagePath, sortOrder, status, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
  const createdAt = existing?.createdAt || nowIso();
  db.prepare(sql).run(stampId, body.groupId || existing?.groupId || '', body.name || existing?.name || 'Untitled', body.imagePath || existing?.imagePath || '', sortOrder, body.status || existing?.status || 'active', createdAt, nowIso());
  return db.prepare('SELECT * FROM stamps WHERE id = ?').get(stampId);
}

function savePostmarkGroup(body, id = null) {
  const groupId = id || generateId('postmark_group');
  const existing = id ? db.prepare('SELECT * FROM postmark_groups WHERE id = ?').get(id) : null;
  if (id && !existing) return null;
  const sql = `INSERT OR REPLACE INTO postmark_groups (id, name, description, sortOrder, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)`;
  const createdAt = existing?.createdAt || nowIso();
  const sortOrder = body.sortOrder !== undefined ? body.sortOrder : (existing?.sortOrder || 0);
  db.prepare(sql).run(groupId, body.name || existing?.name || 'Untitled', body.description || existing?.description || '', sortOrder, createdAt, nowIso());
  return db.prepare('SELECT * FROM postmark_groups WHERE id = ?').get(groupId);
}

function savePostmark(body, id = null) {
  const postmarkId = id || generateId('postmark');
  const existing = id ? db.prepare('SELECT * FROM postmarks WHERE id = ?').get(id) : null;
  if (id && !existing) return null;
  let sortOrder;
  if (body.sortOrder !== undefined) {
    sortOrder = body.sortOrder;
  } else if (existing?.sortOrder !== undefined && existing.sortOrder !== null) {
    sortOrder = existing.sortOrder;
  } else {
    const maxRow = db.prepare('SELECT MAX(sortOrder) as maxSort FROM postmarks WHERE groupId = ?').get(body.groupId || existing?.groupId || '');
    sortOrder = (maxRow?.maxSort ?? -1) + 1;
  }
  const sql = `INSERT OR REPLACE INTO postmarks (id, groupId, name, imagePath, sortOrder, status, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
  const createdAt = existing?.createdAt || nowIso();
  db.prepare(sql).run(postmarkId, body.groupId || existing?.groupId || '', body.name || existing?.name || 'Untitled', body.imagePath || existing?.imagePath || '', sortOrder, body.status || existing?.status || 'active', createdAt, nowIso());
  return db.prepare('SELECT * FROM postmarks WHERE id = ?').get(postmarkId);
}

function deletePostcardTemplate(id) {
  db.prepare('DELETE FROM postcard_templates WHERE id = ?').run(id);
}

function deleteStampGroup(id) {
  db.prepare('DELETE FROM stamps WHERE groupId = ?').run(id);
  db.prepare('DELETE FROM stamp_groups WHERE id = ?').run(id);
}

function deleteStamp(id) {
  db.prepare('DELETE FROM stamps WHERE id = ?').run(id);
}

function deletePostmarkGroup(id) {
  db.prepare('DELETE FROM postmarks WHERE groupId = ?').run(id);
  db.prepare('DELETE FROM postmark_groups WHERE id = ?').run(id);
}

function deletePostmark(id) {
  db.prepare('DELETE FROM postmarks WHERE id = ?').run(id);
}

function moveSortOrder(table, id, direction) {
  const item = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);
  if (!item) return null;
  const groupFilter = table === 'stamps' || table === 'postmarks' ? `groupId = '${item.groupId}'` : '1=1';
  const items = db.prepare(`SELECT * FROM ${table} WHERE ${groupFilter} ORDER BY sortOrder, createdAt`).all();
  const index = items.findIndex((i) => i.id === id);
  if (index === -1) return null;
  const swapIndex = direction === 'up' ? index - 1 : index + 1;
  if (swapIndex < 0 || swapIndex >= items.length) return item;

  const currentOrder = item.sortOrder || 0;
  const swapOrder = items[swapIndex].sortOrder || 0;

  // If both have same sortOrder (e.g., all 0 from legacy data), reassign unique values first
  if (currentOrder === swapOrder) {
    for (let i = 0; i < items.length; i++) {
      db.prepare(`UPDATE ${table} SET sortOrder = ?, updatedAt = ? WHERE id = ?`).run(i, nowIso(), items[i].id);
    }
  }

  // Now swap the two items' sortOrder
  const newItems = db.prepare(`SELECT * FROM ${table} WHERE ${groupFilter} ORDER BY sortOrder, createdAt`).all();
  const newIndex = newItems.findIndex((i) => i.id === id);
  const newSwapIndex = direction === 'up' ? newIndex - 1 : newIndex + 1;
  if (newSwapIndex < 0 || newSwapIndex >= newItems.length) return item;

  const newItem = newItems[newIndex];
  const newSwapItem = newItems[newSwapIndex];
  db.prepare(`UPDATE ${table} SET sortOrder = ?, updatedAt = ? WHERE id = ?`).run(newSwapItem.sortOrder, nowIso(), newItem.id);
  db.prepare(`UPDATE ${table} SET sortOrder = ?, updatedAt = ? WHERE id = ?`).run(newItem.sortOrder, nowIso(), newSwapItem.id);
  return db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);
}

function loadNodes() {
  return db.prepare('SELECT * FROM nodes ORDER BY name').all().map((row) => ({
    ...row,
    capabilities: parseJson(row.capabilities),
  }));
}

function loadCapabilities() {
  return db.prepare('SELECT * FROM capabilities ORDER BY name').all().map((row) => ({
    ...row,
    regions: parseJson(row.regions),
    triggers: parseJson(row.triggers),
    inputs: parseJson(row.inputs),
    outputs: parseJson(row.outputs),
    tags: parseJson(row.tags),
    dependencies: parseJson(row.dependencies),
    graph: { x: row.graphX, y: row.graphY },
  }));
}

function loadDataProducts() {
  return db.prepare('SELECT * FROM data_products ORDER BY updatedAt DESC').all().map((row) => ({
    ...row,
    rawDataExport: Boolean(row.rawDataExport),
    derivedOutputs: parseJson(row.derivedOutputs),
    tags: parseJson(row.tags),
    geoCard: buildGeoCard(row),
  }));
}

function buildGeoCard(product) {
  return {
    schema: 'geonexus.geocard.v1',
    id: product.id,
    capabilityId: product.capabilityId,
    kind: 'data_product',
    title: product.title,
    provider: product.provider,
    nodeId: product.nodeId,
    region: product.region,
    geometryType: product.geometryType,
    temporalCoverage: product.temporalCoverage,
    access: {
      type: 'stac_or_https',
      href: product.accessUrl,
      license: product.license,
    },
    policy: {
      id: product.policyId,
      rawDataExport: Boolean(product.rawDataExport),
      allowedOutputs: parseJson(product.derivedOutputs),
    },
    tags: parseJson(product.tags),
    status: product.status,
    description: product.description,
  };
}

function capabilityTypeForAsset(assetKind) {
  return {
    data: 'GeoDataCapability',
    data_product: 'GeoDataProductCapability',
    model: 'GeoModelCapability',
    skill: 'GeoSkillCapability',
    agent: 'GeoAgentCapability',
    node: 'GeoNodeCapability',
    policy: 'GeoPolicyCapability',
  }[assetKind] || 'GeoCapability';
}

function prefixForAsset(assetKind) {
  return {
    data: 'data',
    data_product: 'data',
    model: 'model',
    skill: 'skill',
    agent: 'agent',
    node: 'nodecap',
    policy: 'policy',
  }[assetKind] || 'cap';
}

function buildAssetGeoCard(asset) {
  return {
    schema: 'geonexus.geocard.v1',
    id: asset.id,
    capabilityId: asset.capabilityId,
    kind: asset.assetKind,
    title: asset.title,
    provider: asset.provider,
    nodeId: asset.nodeId,
    region: asset.region,
    access: {
      type: asset.assetKind === 'model' ? 'model_registry_or_container' : 'stac_https_mcp_or_container',
      href: asset.accessUrl,
      license: asset.license,
    },
    policy: {
      id: asset.policyId,
      rawDataExport: Boolean(asset.rawDataExport),
    },
    inputs: parseJson(asset.inputs),
    outputs: parseJson(asset.outputs),
    tags: parseJson(asset.tags),
    status: asset.status,
    description: asset.description,
    ownerUserId: asset.ownerUserId,
    createdAt: asset.createdAt,
    updatedAt: asset.updatedAt,
  };
}

function loadAssetCards(ownerUserId = null) {
  const rows = ownerUserId
    ? db.prepare('SELECT * FROM asset_cards WHERE ownerUserId = ? ORDER BY updatedAt DESC').all(ownerUserId)
    : db.prepare('SELECT * FROM asset_cards ORDER BY updatedAt DESC').all();
  return rows.map((row) => ({
    ...row,
    rawDataExport: Boolean(row.rawDataExport),
    inputs: parseJson(row.inputs),
    outputs: parseJson(row.outputs),
    tags: parseJson(row.tags),
    geoCard: buildAssetGeoCard(row),
  }));
}

function loadRelations() {
  // "from" is a SQL keyword: unquoted aliases here make every /api/kg request
  // fail with `near "from": syntax error`. The double quotes keep the JSON
  // keys as from/to, which is what app.js reads (link.from / link.to).
  return db.prepare('SELECT sourceId AS "from", targetId AS "to", label FROM relations ORDER BY id').all();
}

function loadTasks() {
  return db.prepare('SELECT * FROM tasks ORDER BY createdAt DESC').all().map((row) => ({
    ...row,
    capabilities: parseJson(row.capabilities),
    outputs: parseJson(row.outputs),
  }));
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || crypto.randomBytes(4).toString('hex');
}

function saveTask(body, id = null) {
  const now = new Date().toISOString();
  const taskId = id || `task.${slugify(body.title || body.hazard || 'geo-task')}-${crypto.randomBytes(3).toString('hex')}`;
  const existing = id ? db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) : null;
  if (id && !existing) return null;
  const task = {
    id: taskId,
    title: body.title || existing?.title || 'Untitled Geo Task',
    region: body.region || existing?.region || 'Global',
    hazard: body.hazard || existing?.hazard || 'general',
    mission: body.mission || existing?.mission || 'Run geospatial analysis.',
    requestedBy: body.requestedBy || existing?.requestedBy || 'GeoNexus Operator',
    status: body.status || existing?.status || 'ready',
    capabilities: body.capabilities || parseJson(existing?.capabilities, []),
    outputs: body.outputs || parseJson(existing?.outputs, []),
    nodeId: body.nodeId || existing?.nodeId || 'node.policy',
    policyId: body.policyId || existing?.policyId || 'policy.data-sovereignty-global',
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
  db.prepare(`
    INSERT OR REPLACE INTO tasks (id, title, region, hazard, mission, requestedBy, status, capabilities, outputs, nodeId, policyId, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    task.id,
    task.title,
    task.region,
    task.hazard,
    task.mission,
    task.requestedBy,
    task.status,
    JSON.stringify(task.capabilities),
    JSON.stringify(task.outputs),
    task.nodeId,
    task.policyId,
    task.createdAt,
    task.updatedAt,
  );
  return task;
}

function saveCapability(body, id = null) {
  const now = new Date().toISOString();
  const capabilityId = id || body.id || `${body.type === 'GeoSkillCapability' ? 'skill' : 'cap'}.${slugify(body.name || 'capability')}`;
  const existing = id ? db.prepare('SELECT * FROM capabilities WHERE id = ?').get(id) : null;
  if (id && !existing) return null;
  const cap = {
    id: capabilityId,
    name: body.name || existing?.name || 'Untitled Capability',
    type: body.type || existing?.type || 'GeoSkillCapability',
    provider: body.provider || existing?.provider || 'GeoNexus Operator',
    nodeId: body.nodeId || existing?.nodeId || 'node.policy',
    regions: body.regions || parseJson(existing?.regions, ['Global']),
    triggers: body.triggers || parseJson(existing?.triggers, []),
    inputs: body.inputs || parseJson(existing?.inputs, []),
    outputs: body.outputs || parseJson(existing?.outputs, []),
    tags: body.tags || parseJson(existing?.tags, []),
    trustLevel: body.trustLevel || existing?.trustLevel || 'community-reviewed',
    latencyClass: body.latencyClass || existing?.latencyClass || 'standard',
    status: body.status || existing?.status || 'available',
    description: body.description || existing?.description || 'Registered GeoAI capability.',
    dependencies: body.dependencies || parseJson(existing?.dependencies, []),
    agentId: body.agentId || existing?.agentId || null,
    graphX: body.graphX ?? existing?.graphX ?? 50,
    graphY: body.graphY ?? existing?.graphY ?? 50,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
  db.prepare(`
    INSERT OR REPLACE INTO capabilities (
      id, name, type, provider, nodeId, regions, triggers, inputs, outputs, tags, trustLevel,
      latencyClass, status, description, dependencies, agentId, graphX, graphY, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    cap.id,
    cap.name,
    cap.type,
    cap.provider,
    cap.nodeId,
    JSON.stringify(cap.regions),
    JSON.stringify(cap.triggers),
    JSON.stringify(cap.inputs),
    JSON.stringify(cap.outputs),
    JSON.stringify(cap.tags),
    cap.trustLevel,
    cap.latencyClass,
    cap.status,
    cap.description,
    JSON.stringify(cap.dependencies),
    cap.agentId,
    cap.graphX,
    cap.graphY,
    cap.createdAt,
    cap.updatedAt,
  );
  return loadCapabilities().find((item) => item.id === cap.id);
}

function saveDataProduct(body, id = null) {
  const now = new Date().toISOString();
  const productId = id || body.id || `data_product.${slugify(body.title || 'data-product')}-${crypto.randomBytes(3).toString('hex')}`;
  const capabilityId = body.capabilityId || productId.replace('data_product.', 'data.');
  const existing = id ? db.prepare('SELECT * FROM data_products WHERE id = ?').get(id) : null;
  if (id && !existing) return null;

  const product = {
    id: productId,
    capabilityId: existing?.capabilityId || capabilityId,
    title: body.title || existing?.title || 'Untitled Data Product',
    provider: body.provider || existing?.provider || 'GeoNexus Data Provider',
    nodeId: body.nodeId || existing?.nodeId || 'node.policy',
    region: body.region || existing?.region || 'Global',
    geometryType: body.geometryType || existing?.geometryType || 'raster',
    temporalCoverage: body.temporalCoverage || existing?.temporalCoverage || 'latest',
    accessUrl: body.accessUrl || existing?.accessUrl || 'https://example.org/stac/catalog.json',
    license: body.license || existing?.license || 'CC-BY-4.0',
    policyId: body.policyId || existing?.policyId || 'policy.data-sovereignty-global',
    rawDataExport: Boolean(body.rawDataExport ?? existing?.rawDataExport ?? false),
    derivedOutputs: body.derivedOutputs || parseJson(existing?.derivedOutputs, ['aggregate_statistics', 'derived_map']),
    tags: body.tags || parseJson(existing?.tags, []),
    description: body.description || existing?.description || 'Registered geospatial data product.',
    status: body.status || existing?.status || 'available',
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };

  const capabilityBody = {
    name: product.title,
    type: 'GeoDataProductCapability',
    provider: product.provider,
    nodeId: product.nodeId,
    description: product.description,
    regions: [product.region],
    triggers: product.tags,
    inputs: ['region', 'date_range', 'policy_context'],
    outputs: product.derivedOutputs,
    tags: ['data-product', 'geocard', ...product.tags],
    trustLevel: 'verified',
    latencyClass: 'standard',
    status: product.status,
    dependencies: [product.policyId],
    graphX: 24,
    graphY: 78,
  };

  const existingCapability = db.prepare('SELECT id FROM capabilities WHERE id = ?').get(product.capabilityId);
  if (existingCapability) {
    saveCapability(capabilityBody, product.capabilityId);
  } else {
    db.prepare(`
      INSERT INTO capabilities (
        id, name, type, provider, nodeId, regions, triggers, inputs, outputs, tags, trustLevel,
        latencyClass, status, description, dependencies, agentId, graphX, graphY, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      product.capabilityId,
      product.title,
      'GeoDataProductCapability',
      product.provider,
      product.nodeId,
      JSON.stringify([product.region]),
      JSON.stringify(product.tags),
      JSON.stringify(['region', 'date_range', 'policy_context']),
      JSON.stringify(product.derivedOutputs),
      JSON.stringify(['data-product', 'geocard', ...product.tags]),
      'verified',
      'standard',
      product.status,
      product.description,
      JSON.stringify([product.policyId]),
      null,
      24,
      78,
      product.createdAt,
      now,
    );
  }

  db.prepare(`
    INSERT OR REPLACE INTO data_products (
      id, capabilityId, title, provider, nodeId, region, geometryType, temporalCoverage, accessUrl,
      license, policyId, rawDataExport, derivedOutputs, tags, description, status, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    product.id,
    product.capabilityId,
    product.title,
    product.provider,
    product.nodeId,
    product.region,
    product.geometryType,
    product.temporalCoverage,
    product.accessUrl,
    product.license,
    product.policyId,
    product.rawDataExport ? 1 : 0,
    JSON.stringify(product.derivedOutputs),
    JSON.stringify(product.tags),
    product.description,
    product.status,
    product.createdAt,
    product.updatedAt,
  );

  return loadDataProducts().find((item) => item.id === product.id);
}

function saveAssetCard(body, user) {
  const now = new Date().toISOString();
  const assetKind = body.assetKind || 'data';
  const cardId = body.id || `card.${assetKind}.${slugify(body.title || 'asset')}-${crypto.randomBytes(3).toString('hex')}`;
  const capabilityId = body.capabilityId || `${prefixForAsset(assetKind)}.${slugify(body.title || 'asset')}-${crypto.randomBytes(3).toString('hex')}`;
  const asset = {
    id: cardId,
    capabilityId,
    ownerUserId: user.id,
    assetKind,
    title: body.title || 'Untitled Asset',
    provider: body.provider || user.org || user.name,
    nodeId: body.nodeId || 'node.policy',
    region: body.region || 'Global',
    accessUrl: body.accessUrl || 'local://asset',
    license: body.license || 'private',
    policyId: body.policyId || 'policy.data-sovereignty-global',
    rawDataExport: Boolean(body.rawDataExport ?? false),
    inputs: body.inputs || [],
    outputs: body.outputs || [],
    tags: body.tags || [],
    description: body.description || 'Registered GeoNexus asset.',
    status: body.status || 'available',
    createdAt: now,
    updatedAt: now,
  };

  const capability = saveCapability({
    id: asset.capabilityId,
    name: asset.title,
    type: capabilityTypeForAsset(asset.assetKind),
    provider: asset.provider,
    nodeId: asset.nodeId,
    regions: [asset.region],
    triggers: asset.tags,
    inputs: asset.inputs,
    outputs: asset.outputs,
    tags: ['geocard', asset.assetKind, ...asset.tags],
    trustLevel: 'community-reviewed',
    latencyClass: 'standard',
    status: asset.status,
    description: asset.description,
    dependencies: [asset.policyId],
    graphX: 42,
    graphY: 74,
  });
  if (!capability) throw new Error('Failed to register capability for asset card');

  db.prepare(`
    INSERT INTO asset_cards (
      id, capabilityId, ownerUserId, assetKind, title, provider, nodeId, region, accessUrl,
      license, policyId, rawDataExport, inputs, outputs, tags, description, status, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    asset.id,
    asset.capabilityId,
    asset.ownerUserId,
    asset.assetKind,
    asset.title,
    asset.provider,
    asset.nodeId,
    asset.region,
    asset.accessUrl,
    asset.license,
    asset.policyId,
    asset.rawDataExport ? 1 : 0,
    JSON.stringify(asset.inputs),
    JSON.stringify(asset.outputs),
    JSON.stringify(asset.tags),
    asset.description,
    asset.status,
    asset.createdAt,
    asset.updatedAt,
  );

  return loadAssetCards(user.id).find((item) => item.id === asset.id);
}

function loadJob(jobId) {
  const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(jobId);
  if (!job) return null;
  const events = db.prepare('SELECT ts, message FROM job_events WHERE jobId = ? ORDER BY id').all(jobId);
  return {
    id: job.id,
    taskId: job.taskId,
    mission: job.mission,
    status: job.status,
    progress: job.progress,
    plan: JSON.parse(job.planJson),
    checkpoints: JSON.parse(job.planJson).checkpoints,
    startedAt: job.startedAt,
    updatedAt: job.updatedAt,
    events,
  };
}

function filterCapabilities(capabilities, query, type, region) {
  const q = (query || '').trim().toLowerCase();
  return capabilities.filter((item) => {
    const haystack = [
      item.id,
      item.name,
      item.type,
      item.provider,
      item.nodeId,
      item.description,
      ...(item.tags || []),
      ...(item.inputs || []),
      ...(item.outputs || []),
      ...(item.regions || []),
    ].join(' ').toLowerCase();
    const queryOk = !q || haystack.includes(q);
    const typeOk = !type || type === 'all' || item.type === type;
    const regionOk = !region || region === 'all' || (item.regions || []).includes(region) || (item.regions || []).includes('Global');
    return queryOk && typeOk && regionOk;
  });
}

function discoverGeoMcp(query, region, types = []) {
  const requestedTypes = Array.isArray(types) ? types : String(types || '').split(',').filter(Boolean);
  const capabilities = filterCapabilities(loadCapabilities(), query, requestedTypes[0] || 'all', region)
    .filter((item) => !requestedTypes.length || requestedTypes.includes(item.type));
  const dataProducts = loadDataProducts().filter((product) => {
    const haystack = [
      product.id,
      product.title,
      product.provider,
      product.region,
      product.geometryType,
      product.description,
      ...(product.tags || []),
      ...(product.derivedOutputs || []),
    ].join(' ').toLowerCase();
    const q = String(query || '').toLowerCase();
    const queryOk = !q || haystack.includes(q);
    const regionOk = !region || region === 'all' || product.region === region || product.region === 'Global';
    return queryOk && regionOk;
  });
  return {
    protocol: 'GeoMCP',
    version: '0.1.0',
    context: { query: query || '', region: region || 'all', types: requestedTypes },
    capabilities,
    dataProducts,
    geoCards: dataProducts.map((product) => product.geoCard),
  };
}

function buildGraph(focus) {
  const capabilities = loadCapabilities();
  const nodes = capabilities.map((capability) => ({
    id: capability.id,
    label: capability.name,
    type: capability.type,
    x: capability.graph?.x ?? 50,
    y: capability.graph?.y ?? 50,
    focus: capability.id === focus || capability.type === focus,
    nodeId: capability.nodeId || null,
  }));
  return { nodes, links: loadRelations() };
}

function selectPlan(mission) {
  const registry = loadCapabilities();
  const nodes = loadNodes();
  const text = mission.toLowerCase();
  const matchedTask = loadTasks().find((task) => text.includes(task.hazard) || text.includes(task.region.toLowerCase()));
  const matchedSkill = registry.find((item) => item.type === 'GeoSkillCapability' && item.triggers.some((trigger) => text.includes(trigger))) || registry.find((item) => item.id === 'skill.flood-impact-analysis');
  const data = registry.filter((item) => (matchedSkill.dependencies || []).includes(item.id));
  const agent = registry.find((item) => item.id === matchedSkill.agentId);
  const node = nodes.find((item) => item.id === matchedSkill.nodeId) || nodes[0];
  const policy = registry.find((item) => item.id === node.policyId);
  const graph = buildGraph(matchedSkill.id);

  return {
    task: matchedTask || null,
    mission,
    selected: { skill: matchedSkill, data, agent, node, policy },
    graph,
    steps: [
      { id: 'intent', label: 'Parse mission intent', detail: 'Extract region, hazard, and target outputs.' },
      { id: 'discover', label: 'Discover GeoSkills', detail: 'Search registry for eligible capabilities.' },
      { id: 'route', label: 'Select GeoNode and policy', detail: 'Choose a node with sovereignty constraints.' },
      { id: 'execute', label: 'Execute workflow', detail: 'Run data retrieval, inference, and analysis.' },
      { id: 'publish', label: 'Publish outputs', detail: 'Store results and derived geospatial artifacts.' },
    ],
    explain: `Selected ${matchedSkill.name} and routed through ${node.name} under ${policy.name}.`,
  };
}

function persistJob(job) {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO jobs (id, taskId, mission, status, progress, planJson, startedAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(job.id, job.taskId || null, job.mission, job.status, job.progress, JSON.stringify(job.plan), job.startedAt, job.updatedAt);
}

function persistJobEvent(jobId, message) {
  db.prepare('INSERT INTO job_events (jobId, ts, message) VALUES (?, ?, ?)').run(jobId, new Date().toISOString(), message);
}

function createJob(plan) {
  const id = `job_${crypto.randomBytes(6).toString('hex')}`;
  const checkpoints = plan.steps.map((step, index) => ({
    id: step.id,
    step: step.label,
    status: index === 0 ? 'running' : 'pending',
    note: index === 0 ? 'GeoAgent has started orchestration.' : 'Waiting in queue.',
  }));
  const job = {
    id,
    taskId: plan.task?.id || null,
    mission: plan.mission,
    status: 'running',
    progress: 8,
    checkpoints,
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    events: [
      { ts: new Date().toISOString(), message: 'Job accepted by GeoMCP gateway.' },
      { ts: new Date().toISOString(), message: 'GeoAgent plan generated.' },
    ],
    plan,
  };

  persistJob(job);
  job.events.forEach((event) => persistJobEvent(id, event.message));

  let index = 0;
  const timer = setInterval(() => {
    const current = loadJob(id);
    if (!current) {
      clearInterval(timer);
      jobTimers.delete(id);
      return;
    }
    if (index < current.checkpoints.length) {
      const checkpointsCopy = current.checkpoints.map((item) => ({ ...item }));
      checkpointsCopy[index].status = 'done';
      checkpointsCopy[index].note = 'Completed and verified.';
      current.progress = Math.min(100, Math.round(((index + 1) / checkpointsCopy.length) * 100));
      current.status = index + 1 === checkpointsCopy.length ? 'succeeded' : 'running';
      current.checkpoints = checkpointsCopy;
      current.updatedAt = new Date().toISOString();
      current.plan.checkpoints = checkpointsCopy;
      persistJob(current);
      persistJobEvent(id, `${checkpointsCopy[index].step} completed.`);
      index += 1;
      if (index < checkpointsCopy.length) {
        const next = checkpointsCopy[index];
        next.status = 'running';
        next.note = 'GeoSkill is now active.';
        current.updatedAt = new Date().toISOString();
        current.plan.checkpoints = checkpointsCopy;
        persistJob(current);
      } else {
        persistJobEvent(id, 'GeoNexus published derived outputs.');
        clearInterval(timer);
        jobTimers.delete(id);
      }
    }
  }, 900);

  jobTimers.set(id, timer);
  return job;
}

function serveStatic(req, res, pathname) {
  let filePath = pathname === '/' ? '/index.html' : pathname;
  filePath = path.join(ROOT, filePath);
  if (!filePath.startsWith(ROOT) && !filePath.startsWith(UPLOADS_DIR)) return notFound(res);
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(ROOT, 'index.html');
  }
  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Cache-Control': 'no-store',
  });
  fs.createReadStream(filePath).pipe(res);
}

async function handleApi(req, res, url) {
  if (req.method === 'GET' && url.pathname === '/api/health') {
    return send(res, 200, { ok: true, name: 'GeoNexus API', db: 'sqlite' });
  }

  if (req.method === 'POST' && url.pathname === '/api/auth/register') {
    const body = await readBody(req);
    if (!body.email || !body.password || !body.name) return send(res, 400, { error: 'name, email and password are required' });
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(String(body.email).toLowerCase());
    if (existing) return send(res, 409, { error: 'Email already registered' });
    const id = `user.${slugify(body.name)}-${crypto.randomBytes(3).toString('hex')}`;
    const { salt, passwordHash } = hashPassword(body.password);
    db.prepare('INSERT INTO users (id, name, email, passwordHash, salt, org) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, body.name, String(body.email).toLowerCase(), passwordHash, salt, body.org || 'GeoNexus Workspace');
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    const session = createSession(id);
    return send(res, 201, { user: publicUser(user), token: session.token, expiresAt: session.expiresAt });
  }

  if (req.method === 'POST' && url.pathname === '/api/auth/login') {
    const body = await readBody(req);
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(String(body.email || '').toLowerCase());
    if (!user) return send(res, 401, { error: 'Invalid email or password' });
    const { passwordHash } = hashPassword(body.password || '', user.salt);
    if (passwordHash !== user.passwordHash) return send(res, 401, { error: 'Invalid email or password' });
    const session = createSession(user.id);
    return send(res, 200, { user: publicUser(user), token: session.token, expiresAt: session.expiresAt });
  }

  if (req.method === 'GET' && url.pathname === '/api/auth/me') {
    const user = getAuthUser(req);
    return send(res, 200, { user: publicUser(user) });
  }

  if (req.method === 'GET' && url.pathname === '/api/registry') {
    const query = url.searchParams.get('query') || '';
    const type = url.searchParams.get('type') || 'all';
    const region = url.searchParams.get('region') || 'all';
    const capabilities = filterCapabilities(loadCapabilities(), query, type, region);
    const nodes = loadNodes();
    return send(res, 200, {
      summary: {
        total: loadCapabilities().length,
        filtered: capabilities.length,
        nodeCount: nodes.length,
        skillCount: loadCapabilities().filter((item) => item.type === 'GeoSkillCapability').length,
        dataProductCount: loadDataProducts().length,
      },
      capabilities,
      nodes,
      dataProducts: loadDataProducts(),
      assetCards: loadAssetCards(),
    });
  }

  if (req.method === 'GET' && url.pathname === '/api/geocards') {
    const products = loadDataProducts();
    const assetCards = loadAssetCards();
    return send(res, 200, {
      geoCards: [...products.map((product) => product.geoCard), ...assetCards.map((asset) => asset.geoCard)],
      dataProducts: products,
      assetCards,
    });
  }

  if (req.method === 'GET' && url.pathname.startsWith('/api/geocards/')) {
    const id = decodeURIComponent(url.pathname.split('/').pop());
    const product = loadDataProducts().find((item) => item.id === id || item.capabilityId === id);
    const asset = loadAssetCards().find((item) => item.id === id || item.capabilityId === id);
    if (!product && !asset) return notFound(res);
    return send(res, 200, { geoCard: product?.geoCard || asset.geoCard, dataProduct: product || null, assetCard: asset || null });
  }

  if (req.method === 'GET' && url.pathname === '/api/assets') {
    const user = getAuthUser(req);
    return send(res, 200, { assetCards: loadAssetCards(user?.id || null) });
  }

  if (req.method === 'POST' && url.pathname === '/api/assets') {
    const user = requireAuth(req, res);
    if (!user) return;
    const body = await readBody(req);
    const assetCard = saveAssetCard(body, user);
    return send(res, 201, { assetCard, geoCard: assetCard.geoCard });
  }

  if (req.method === 'GET' && url.pathname === '/api/data-products') {
    return send(res, 200, { dataProducts: loadDataProducts() });
  }

  if (req.method === 'POST' && url.pathname === '/api/data-products') {
    const body = await readBody(req);
    const dataProduct = saveDataProduct(body);
    return send(res, 201, { dataProduct, geoCard: dataProduct.geoCard });
  }

  if (req.method === 'POST' && url.pathname === '/api/geomcp/register') {
    const body = await readBody(req);
    if (body.kind && body.kind !== 'data_product') {
      const user = requireAuth(req, res);
      if (!user) return;
      const assetCard = saveAssetCard({ ...body, assetKind: body.kind }, user);
      return send(res, 201, {
        protocol: 'GeoMCP',
        action: 'register',
        resource: body.kind,
        assetCard,
        geoCard: assetCard.geoCard,
      });
    }
    const dataProduct = saveDataProduct(body);
    return send(res, 201, {
      protocol: 'GeoMCP',
      action: 'register',
      resource: 'data_product',
      dataProduct,
      geoCard: dataProduct.geoCard,
    });
  }

  if (req.method === 'POST' && url.pathname === '/api/geomcp/discover') {
    const body = await readBody(req);
    const payload = discoverGeoMcp(body.query, body.region, body.types);
    const assetCards = loadAssetCards().filter((asset) => {
      const q = String(body.query || '').toLowerCase();
      const haystack = [asset.title, asset.assetKind, asset.provider, asset.region, asset.description, ...(asset.tags || [])].join(' ').toLowerCase();
      const queryOk = !q || haystack.includes(q);
      const regionOk = !body.region || body.region === 'all' || asset.region === body.region || asset.region === 'Global';
      return queryOk && regionOk;
    });
    return send(res, 200, {
      ...payload,
      assetCards,
      geoCards: [...payload.geoCards, ...assetCards.map((asset) => asset.geoCard)],
    });
  }

  if (req.method === 'GET' && url.pathname.startsWith('/api/capabilities/')) {
    const id = decodeURIComponent(url.pathname.split('/').pop());
    const capability = loadCapabilities().find((item) => item.id === id);
    if (!capability) return notFound(res);
    return send(res, 200, { capability });
  }

  if (req.method === 'POST' && url.pathname === '/api/capabilities') {
    const body = await readBody(req);
    const capability = saveCapability(body);
    return send(res, 201, { capability });
  }

  if (req.method === 'PUT' && url.pathname.startsWith('/api/capabilities/')) {
    const id = decodeURIComponent(url.pathname.split('/').pop());
    const body = await readBody(req);
    const capability = saveCapability(body, id);
    if (!capability) return notFound(res);
    return send(res, 200, { capability });
  }

  if (req.method === 'GET' && url.pathname === '/api/kg') {
    const focus = url.searchParams.get('focus') || 'skill.flood-impact-analysis';
    return send(res, 200, buildGraph(focus));
  }

  if (req.method === 'GET' && url.pathname === '/api/nodes') {
    return send(res, 200, { nodes: loadNodes() });
  }

  if (req.method === 'GET' && url.pathname === '/api/tasks') {
    return send(res, 200, { tasks: loadTasks() });
  }

  if (req.method === 'GET' && url.pathname.startsWith('/api/tasks/')) {
    const id = decodeURIComponent(url.pathname.split('/').pop());
    const task = loadTasks().find((item) => item.id === id);
    if (!task) return notFound(res);
    return send(res, 200, { task });
  }

  if (req.method === 'POST' && url.pathname === '/api/tasks') {
    const body = await readBody(req);
    const task = saveTask(body);
    return send(res, 201, { task });
  }

  if (req.method === 'PUT' && url.pathname.startsWith('/api/tasks/')) {
    const id = decodeURIComponent(url.pathname.split('/').pop());
    const body = await readBody(req);
    const task = saveTask(body, id);
    if (!task) return notFound(res);
    return send(res, 200, { task });
  }

  if (req.method === 'POST' && url.pathname === '/api/plan') {
    const body = await readBody(req);
    const plan = selectPlan(body.mission || 'Assess flood impact and derive outputs.');
    return send(res, 200, plan);
  }

  if (req.method === 'POST' && url.pathname === '/api/jobs') {
    const body = await readBody(req);
    const plan = body.plan || selectPlan(body.mission || 'Assess flood impact and derive outputs.');
    const job = createJob(plan);
    return send(res, 200, job);
  }

  if (req.method === 'GET' && url.pathname.startsWith('/api/jobs/')) {
    const id = decodeURIComponent(url.pathname.split('/').pop());
    const job = loadJob(id);
    if (!job) return notFound(res);
    return send(res, 200, job);
  }

  if (req.method === 'POST' && url.pathname === '/api/upload') {
    const contentType = req.headers['content-type'] || '';
    if (!contentType.includes('multipart/form-data')) {
      return send(res, 400, { error: 'Expected multipart/form-data' });
    }
    const buffer = await readRawBody(req);
    const multipart = parseMultipart(buffer, contentType);
    const file = multipart.files[0];
    if (!file) return send(res, 400, { error: 'No file uploaded' });
    const ext = path.extname(file.filename).toLowerCase() || '.bin';
    const safeName = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`;
    const filePath = path.join(UPLOADS_DIR, safeName);
    fs.writeFileSync(filePath, file.data);
    return send(res, 201, { url: `/uploads/${safeName}`, filename: safeName });
  }

  if (req.method === 'GET' && url.pathname === '/api/postcard-templates') {
    return send(res, 200, { templates: loadPostcardTemplates() });
  }

  if (req.method === 'POST' && url.pathname === '/api/postcard-templates') {
    const body = await readBody(req);
    const template = savePostcardTemplate(body);
    return send(res, 201, { template });
  }

  if (req.method === 'PUT' && url.pathname.startsWith('/api/postcard-templates/')) {
    const id = decodeURIComponent(url.pathname.split('/').pop());
    const body = await readBody(req);
    const template = savePostcardTemplate(body, id);
    if (!template) return notFound(res);
    return send(res, 200, { template });
  }

  if (req.method === 'DELETE' && url.pathname.startsWith('/api/postcard-templates/')) {
    const id = decodeURIComponent(url.pathname.split('/').pop());
    deletePostcardTemplate(id);
    return send(res, 200, { ok: true });
  }

  if (req.method === 'GET' && url.pathname === '/api/stamp-groups') {
    return send(res, 200, { groups: loadStampGroups() });
  }

  if (req.method === 'POST' && url.pathname === '/api/stamp-groups') {
    const body = await readBody(req);
    const group = saveStampGroup(body);
    return send(res, 201, { group });
  }

  if (req.method === 'PUT' && url.pathname.startsWith('/api/stamp-groups/')) {
    const id = decodeURIComponent(url.pathname.split('/').pop());
    const body = await readBody(req);
    const group = saveStampGroup(body, id);
    if (!group) return notFound(res);
    return send(res, 200, { group });
  }

  if (req.method === 'DELETE' && url.pathname.startsWith('/api/stamp-groups/')) {
    const id = decodeURIComponent(url.pathname.split('/').pop());
    deleteStampGroup(id);
    return send(res, 200, { ok: true });
  }

  if (req.method === 'GET' && url.pathname === '/api/stamps') {
    const groupId = url.searchParams.get('groupId');
    return send(res, 200, { stamps: loadStamps(groupId || null) });
  }

  if (req.method === 'POST' && url.pathname === '/api/stamps') {
    const body = await readBody(req);
    const stamp = saveStamp(body);
    return send(res, 201, { stamp });
  }

  if (req.method === 'PUT' && url.pathname.startsWith('/api/stamps/')) {
    const id = decodeURIComponent(url.pathname.split('/').pop());
    const body = await readBody(req);
    const stamp = saveStamp(body, id);
    if (!stamp) return notFound(res);
    return send(res, 200, { stamp });
  }

  if (req.method === 'DELETE' && url.pathname.startsWith('/api/stamps/')) {
    const id = decodeURIComponent(url.pathname.split('/').pop());
    deleteStamp(id);
    return send(res, 200, { ok: true });
  }

  if (req.method === 'POST' && url.pathname.startsWith('/api/stamps/') && url.pathname.endsWith('/move-up')) {
    const id = decodeURIComponent(url.pathname.split('/')[3]);
    const stamp = moveSortOrder('stamps', id, 'up');
    return send(res, 200, { stamp });
  }

  if (req.method === 'POST' && url.pathname.startsWith('/api/stamps/') && url.pathname.endsWith('/move-down')) {
    const id = decodeURIComponent(url.pathname.split('/')[3]);
    const stamp = moveSortOrder('stamps', id, 'down');
    return send(res, 200, { stamp });
  }

  if (req.method === 'GET' && url.pathname === '/api/postmark-groups') {
    return send(res, 200, { groups: loadPostmarkGroups() });
  }

  if (req.method === 'POST' && url.pathname === '/api/postmark-groups') {
    const body = await readBody(req);
    const group = savePostmarkGroup(body);
    return send(res, 201, { group });
  }

  if (req.method === 'PUT' && url.pathname.startsWith('/api/postmark-groups/')) {
    const id = decodeURIComponent(url.pathname.split('/').pop());
    const body = await readBody(req);
    const group = savePostmarkGroup(body, id);
    if (!group) return notFound(res);
    return send(res, 200, { group });
  }

  if (req.method === 'DELETE' && url.pathname.startsWith('/api/postmark-groups/')) {
    const id = decodeURIComponent(url.pathname.split('/').pop());
    deletePostmarkGroup(id);
    return send(res, 200, { ok: true });
  }

  if (req.method === 'GET' && url.pathname === '/api/postmarks') {
    const groupId = url.searchParams.get('groupId');
    return send(res, 200, { postmarks: loadPostmarks(groupId || null) });
  }

  if (req.method === 'POST' && url.pathname === '/api/postmarks') {
    const body = await readBody(req);
    const postmark = savePostmark(body);
    return send(res, 201, { postmark });
  }

  if (req.method === 'PUT' && url.pathname.startsWith('/api/postmarks/')) {
    const id = decodeURIComponent(url.pathname.split('/').pop());
    const body = await readBody(req);
    const postmark = savePostmark(body, id);
    if (!postmark) return notFound(res);
    return send(res, 200, { postmark });
  }

  if (req.method === 'DELETE' && url.pathname.startsWith('/api/postmarks/')) {
    const id = decodeURIComponent(url.pathname.split('/').pop());
    deletePostmark(id);
    return send(res, 200, { ok: true });
  }

  if (req.method === 'POST' && url.pathname.startsWith('/api/postmarks/') && url.pathname.endsWith('/move-up')) {
    const id = decodeURIComponent(url.pathname.split('/')[3]);
    const postmark = moveSortOrder('postmarks', id, 'up');
    return send(res, 200, { postmark });
  }

  if (req.method === 'POST' && url.pathname.startsWith('/api/postmarks/') && url.pathname.endsWith('/move-down')) {
    const id = decodeURIComponent(url.pathname.split('/')[3]);
    const postmark = moveSortOrder('postmarks', id, 'down');
    return send(res, 200, { postmark });
  }

  return notFound(res);
}

function listen(port) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname.startsWith('/api/')) {
      handleApi(req, res, url).catch((error) => {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: error.message }));
      });
      return;
    }
    serveStatic(req, res, url.pathname);
  });

  server.once('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      const nextPort = port + 1;
      console.log(`Port ${port} busy, trying ${nextPort}`);
      listen(nextPort);
      return;
    }
    throw error;
  });

  server.listen(port, () => {
    console.log(`GeoNexus API running at http://localhost:${port}`);
  });
}

listen(START_PORT);
