'use strict';
/** 平台的基础表结构 —— **唯一**一份 DDL。
 *
 *  为什么单独成模块：服务启动要建表，种子脚本（scripts/seed-*.mjs）在**全新数据库**
 *  上也要建表。两处各写一遍 DDL 必然漂移（改了一处忘了另一处，症状是运行时
 *  "no such table"）。所以 DDL 只在这里，server.js 与种子脚本都调它。
 */
module.exports = { initSchema };

/** 建表（幂等：全部 IF NOT EXISTS）。 */
function initSchema(db) {
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
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      roles TEXT NOT NULL DEFAULT '[]',
      scopes TEXT NOT NULL DEFAULT '[]'
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
