'use strict';
/** SDK Web BFF 客户端（默认 :8900）——**唯一带 task_id 的入口**。
 *
 *  为什么不是执行面 8787：8787 只有同步 geo.execute，没有 task_id、不落盘（见调研）。
 *  这里的职责：服务账号登录并缓存 JWT、提交执行、查询/取消任务。 */

const DEFAULT_TIMEOUT = 10000;

class SdkWebError extends Error {
  constructor(message, { status = 0, detail = null, url = '' } = {}) {
    super(message);
    this.name = 'SdkWebError';
    this.status = status;
    this.detail = detail;
    this.url = url;
  }
}

function createSdkWebClient(options = {}) {
  const baseUrl = (options.baseUrl || process.env.SDK_WEB_URL || 'http://127.0.0.1:8900').replace(/\/$/, '');
  const username = options.username || process.env.SDK_WEB_USER || 'admin';
  const password = options.password || process.env.SDK_WEB_PASSWORD || 'admin';
  const nodeUrl = options.nodeUrl || process.env.SDK_NODE_URL || 'http://127.0.0.1:8787';
  const timeout = options.timeout ?? DEFAULT_TIMEOUT;

  let token = null;
  let tokenExpiresAt = 0;

  async function raw(path, { method = 'GET', body, auth = true } = {}) {
    if (auth) await ensureToken();
    const url = `${baseUrl}${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const res = await fetch(url, {
        method,
        signal: controller.signal,
        headers: {
          accept: 'application/json',
          ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
          ...(auth && token ? { authorization: `Bearer ${token}` } : {})
        },
        body: body !== undefined ? JSON.stringify(body) : undefined
      });
      const text = await res.text();
      let data = null;
      try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
      if (!res.ok) {
        // JWT 过期：清缓存后由上层重试一次（ensureToken 会重新登录）
        if (res.status === 401 && auth) { token = null; tokenExpiresAt = 0; }
        const detail = data?.detail ?? data?.error ?? data;
        throw new SdkWebError(`SDK Web ${res.status}: ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`,
          { status: res.status, detail, url });
      }
      return data;
    } catch (err) {
      if (err instanceof SdkWebError) throw err;
      if (err.name === 'AbortError') throw new SdkWebError(`SDK Web 超时（${timeout}ms）`, { url });
      throw new SdkWebError(err.message || 'SDK Web 不可达', { url });
    } finally {
      clearTimeout(timer);
    }
  }

  /** 服务账号登录：token 缓存到过期前 60s。 */
  async function ensureToken() {
    if (token && Date.now() < tokenExpiresAt) return token;
    const res = await raw('/api/auth/login', { method: 'POST', body: { username, password }, auth: false });
    token = res?.token || null;
    const ttl = Number(res?.expires_in || 3600);
    tokenExpiresAt = Date.now() + Math.max(30, ttl - 60) * 1000;
    if (!token) throw new SdkWebError('SDK Web 登录未返回 token');
    return token;
  }

  return {
    baseUrl, nodeUrl,
    defaultNodeUrl: () => nodeUrl,

    /** 提交一次执行 → {task_id, status}。注意：不传 geocards（本机节点未注册卡片，传了必 2002）。 */
    async execute({ skill, params = {}, nodeUrl: override, geocards }) {
      const body = { skill, params, node_url: override || nodeUrl };
      if (Array.isArray(geocards) && geocards.length) body.geocards = geocards;
      return raw('/api/execute', { method: 'POST', body });
    },

    /** 任务视图；done/cancelled 时含 result（产物在 result.outputs.*）。 */
    getTask(taskId) { return raw(`/api/tasks/${encodeURIComponent(taskId)}`); },
    listTasks() { return raw('/api/tasks'); },
    cancelTask(taskId) { return raw(`/api/tasks/${encodeURIComponent(taskId)}/cancel`, { method: 'POST' }); },
    health() { return raw('/api/health', { auth: false }); },
    /** 仅供测试与诊断：当前是否已持有可用令牌。 */
    hasToken: () => Boolean(token) && Date.now() < tokenExpiresAt
  };
}

module.exports = { createSdkWebClient, SdkWebError };
