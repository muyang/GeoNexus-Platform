'use strict';
/** SDK 侧客户端：Registry（GeoCard 注册与审核）+ GeoNode 健康探测。
 *
 *  平台的定位是"手脚"：契约权威在 SDK，平台只做提交、转发审核、查询与归一化，
 *  不复制卡片语义。所有写操作都走 SDK 自己的审核状态机（pending → approved/rejected）。 */

const DEFAULT_TIMEOUT = 6000;

class SdkError extends Error {
  constructor(message, { status = 0, detail = null, url = '' } = {}) {
    super(message);
    this.name = 'SdkError';
    this.status = status;
    this.detail = detail;
    this.url = url;
  }
}

function createSdkClient(options = {}) {
  const registryUrl = (options.registryUrl || process.env.REGISTRY_URL || 'http://127.0.0.1:8790').replace(/\/$/, '');
  const apiKey = options.apiKey ?? process.env.SDK_REGISTRY_API_KEY ?? '';
  const timeout = options.timeout ?? DEFAULT_TIMEOUT;

  async function call(path, { method = 'GET', body } = {}) {
    const url = `${registryUrl}${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const res = await fetch(url, {
        method,
        signal: controller.signal,
        headers: {
          accept: 'application/json',
          ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
          ...(apiKey ? { 'X-API-Key': apiKey } : {})
        },
        body: body !== undefined ? JSON.stringify(body) : undefined
      });
      const text = await res.text();
      let data = null;
      try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
      if (!res.ok) {
        const detail = data?.detail ?? data?.error ?? data;
        const msg = typeof detail === 'string' ? detail : JSON.stringify(detail);
        throw new SdkError(`SDK ${res.status}: ${msg}`, { status: res.status, detail, url });
      }
      return data;
    } catch (err) {
      if (err instanceof SdkError) throw err;
      if (err.name === 'AbortError') throw new SdkError(`SDK 超时（${timeout}ms）`, { url });
      throw new SdkError(err.message || 'SDK 不可达', { url });
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    registryUrl,
    /** status: 'approved'(默认) | 'pending' | 'rejected' | 'all' */
    listCards({ status = 'all' } = {}) {
      const q = status ? `?status=${encodeURIComponent(status)}` : '';
      return call(`/cards${q}`);
    },
    getCard(id) { return call(`/cards/${encodeURIComponent(id)}`); },
    /** 提交卡片：默认 pending，进入 SDK 的审核队列（这是"发布走审批流"的关键一步）。 */
    registerCard({ card, nodeUrl = 'platform', status = 'pending', reviewNote = null }) {
      return call('/cards', { method: 'POST', body: { card, node_url: nodeUrl, status, ...(reviewNote ? { review_note: reviewNote } : {}) } });
    },
    approve(id, { note = null, by = null } = {}) {
      return call(`/cards/${encodeURIComponent(id)}/approve`, { method: 'POST', body: { note, by } });
    },
    reject(id, { note = null, by = null } = {}) {
      return call(`/cards/${encodeURIComponent(id)}/reject`, { method: 'POST', body: { note, by } });
    },
    health() { return call('/health'); },

    /** SDK 注册项 → 前端统一形状（含可见性与溯源，供地图与目录共用）。 */
    normalize(entry) {
      const card = entry?.card || entry || {};
      const spatial = card.spatial || {};
      const provenance = card.provenance || {};
      const compliance = card.compliance || {};
      const access = card.access || {};
      const sensitivity = compliance.sensitivity || 'public';
      return {
        id: card.id,
        type: card.type || 'data',
        title: card.name || card.id,
        description: card.description || '',
        provider: provenance.provider || access.endpoint || '',
        ref: access.endpoint || card.id,
        owner: entry?.node_url || access.endpoint || 'unknown-node',
        visibility: sensitivity === 'public' ? 'public' : sensitivity,
        sovereignty: compliance.sovereignty || null,
        license: typeof card.license === 'string' ? card.license : (card.license?.name || ''),
        tags: card.tags || [],
        capabilities: (card.capabilities || []).map((c) => c.name || c).filter(Boolean),
        protocol: access.protocol || '',
        bbox: Array.isArray(spatial.bbox) && spatial.bbox.length === 4 ? spatial.bbox : null,
        temporal: card.temporal || null,
        status: entry?.status || 'unknown',
        reviewNote: entry?.review_note || null,
        reviewHistory: entry?.review_history || [],
        registeredAt: entry?.registered_at || null,
        submittedBy: entry?.submitted_by || null,
        nodeUrl: entry?.node_url || null,
        source: 'sdk-registry'
      };
    }
  };
}

module.exports = { createSdkClient, SdkError };
