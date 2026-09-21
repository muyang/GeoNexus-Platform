'use strict';
/** Java（RuoYi）签发的 RS256 JWT 验签：用 JWKS 公钥就地验证，无需共享密钥。
 *
 *  为什么需要：身份权威迁到 Java 之后，Node BFF 仍然要认这个令牌，否则业务面全 401。
 *  做法：启动即拉取 JWKS 并定期刷新，verify() 是**同步**的（crypto.verify），
 *  这样不必把既有的一堆同步 getAuthUser/requireAuth 调用点改成异步。
 */

const crypto = require('crypto');

function b64urlToBuf(s) {
  return Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

function createJwtVerifier({ jwksUrl, issuer = 'geonexus-platform', refreshMs = 60 * 1000, timeoutMs = 4000, onRotate } = {}) {
  /** kid → KeyObject */
  const keys = new Map();
  let lastError = null;
  let lastFetch = 0;
  let inFlight = null;

  async function refresh() {
    if (!jwksUrl) return false;
    if (inFlight) return inFlight;                       // 并发去重：多处同时发现未知 kid 时只拉一次
    inFlight = doRefresh().finally(() => { inFlight = null; });
    return inFlight;
  }

  async function doRefresh() {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(jwksUrl, { signal: controller.signal, headers: { accept: 'application/json' } });
      if (!res.ok) throw new Error(`JWKS HTTP ${res.status}`);
      const body = await res.json();
      const list = Array.isArray(body?.keys) ? body.keys : [];
      keys.clear();
      for (const jwk of list) {
        if (jwk.kty !== 'RSA' || !jwk.n || !jwk.e) continue;
        try {
          const key = crypto.createPublicKey({ key: { kty: 'RSA', n: jwk.n, e: jwk.e }, format: 'jwk' });
          keys.set(jwk.kid || 'default', key);
        } catch { /* 跳过坏 key */ }
      }
      lastFetch = Date.now();
      lastError = null;
      return keys.size > 0;
    } catch (err) {
      lastError = err.message;
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  /** 同步验签。返回 claims 或 null（调用方一律按未认证处理）。 */
  function verify(token) {
    if (!token || typeof token !== 'string') return null;
    // 缓存过期就顺手刷新（不阻塞本次判定）
    if (keys.size === 0 || (refreshMs > 0 && Date.now() - lastFetch > refreshMs)) {
      refresh().catch(() => { /* 忽略 */ });
    }
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    let header; let payload;
    try {
      header = JSON.parse(b64urlToBuf(parts[0]).toString('utf8'));
      payload = JSON.parse(b64urlToBuf(parts[1]).toString('utf8'));
    } catch { return null; }
    if (header.alg !== 'RS256') return null;
    // 令牌可能不带 kid（jjwt 默认就不带）：此时用唯一公钥，或逐个试
    let candidates;
    if (header.kid) {
      const byKid = keys.get(header.kid) || keys.get('default');
      if (byKid) {
        candidates = [byKid];
      } else {
        // 公钥轮换：本地没有这个 kid —— 立即重取一次（不阻塞本次请求，下一次即可通过）
        if (onRotate) onRotate(header.kid);
        refresh().catch(() => { /* 下次请求再试 */ });
        return null;
      }
    } else {
      candidates = keys.size === 1 ? [keys.values().next().value] : [...keys.values()];
    }
    if (!candidates.length) {
      refresh().catch(() => { /* 还没有公钥 */ });
      return null;
    }
    const signed = Buffer.from(`${parts[0]}.${parts[1]}`);
    const sig = b64urlToBuf(parts[2]);
    let ok = false;
    for (const key of candidates) {
      try { if (crypto.verify('RSA-SHA256', signed, key, sig)) { ok = true; break; } } catch { /* 试下一个 */ }
    }
    if (!ok) return null;
    if (issuer && payload.iss && payload.iss !== issuer) return null;
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && now >= Number(payload.exp)) return null;
    if (payload.nbf && now < Number(payload.nbf)) return null;
    return payload;
  }

  /** claims → 平台内部用户形状（与 SQLite 会话用户对齐，便于复用权限判定）。 */
  function toUser(claims) {
    if (!claims) return null;
    const roles = Array.isArray(claims.roles) ? claims.roles : [];
    const scopes = Array.isArray(claims.scopes) ? claims.scopes : [];
    return {
      id: claims.userId ?? claims.sub,
      userId: claims.userId ?? claims.sub,
      name: claims.nickName || claims.userName,
      userName: claims.userName,
      email: claims.email || claims.userName,
      deptId: claims.deptId ?? null,
      tenant: claims.tenant ?? null,
      accountType: claims.accountType || null,
      roles, scopes,
      isAdmin: scopes.includes('*') || roles.includes('platform_admin') || roles.includes('admin'),
      jti: claims.jti || null,
      source: 'java-jwt'
    };
  }

  /** 只解 JWT 头拿 kid（不验签）——用于"要不要先刷新公钥"的前置判断。 */
  function peekKeyId(token) {
    try {
      const header = JSON.parse(b64urlToBuf(String(token).split('.')[0]).toString('utf8'));
      return header.kid || null;
    } catch { return null; }
  }

  return {
    refresh,
    verify,
    toUser,
    peekKeyId,
    hasKey: (kid) => keys.has(kid),
    get keyCount() { return keys.size; },
    get lastError() { return lastError; },
    get lastFetch() { return lastFetch; }
  };
}

module.exports = { createJwtVerifier };
