'use strict';
/** 方案（Recipe）客户端：目录在 SDK Registry，物化在 GeoNode。
 *
 *  分工（与 lib/sdk-client.js 同一套约束）：
 *   · **契约权威在 SDK**。参数能不能改、改到什么范围，由 SDK 的参数契约判定；
 *     平台只把错误原样翻译成 400 + 字段名，绝不自己复制一份校验规则。
 *   · **执行权威在 SDK**。`geo.plan` 返回任务图，平台据此展示"会发生什么"，
 *     再决定是否真的提交执行。
 *   · 平台只负责：把目录里的方案落到本平台的案例上（case_recipes），
 *     记录这次的参数取值，并把交付物登记成可下载产物。
 *
 *  两个上游：
 *   · Registry（默认 :8790）—— 目录与审核：/recipes
 *   · GeoNode（默认 :8787）—— 物化：JSON-RPC geo.plan（POST /geomcp）
 */

const DEFAULT_TIMEOUT = 8000;

class RecipeError extends Error {
  constructor(message, { status = 0, detail = null, code = null, url = '' } = {}) {
    super(message);
    this.name = 'RecipeError';
    this.status = status;
    this.detail = detail;
    this.code = code;          // GeoMCP 错误码（2005 找不到 / 2006 参数契约不满足）
    this.field = detail?.field || null;
    this.url = url;
  }
}

function createRecipeClient(options = {}) {
  const registryUrl = (options.registryUrl || process.env.REGISTRY_URL || 'http://127.0.0.1:8790').replace(/\/$/, '');
  const nodeUrl = (options.nodeUrl || process.env.SDK_NODE_URL || 'http://127.0.0.1:8787').replace(/\/$/, '');
  const apiKey = options.apiKey ?? process.env.SDK_REGISTRY_API_KEY ?? '';
  const timeout = options.timeout ?? DEFAULT_TIMEOUT;

  async function call(url, { method = 'GET', body, headers = {} } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const res = await fetch(url, {
        method,
        signal: controller.signal,
        headers: {
          accept: 'application/json',
          ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
          ...(apiKey ? { 'X-API-Key': apiKey } : {}),
          ...headers
        },
        body: body !== undefined ? JSON.stringify(body) : undefined
      });
      const text = await res.text();
      let data = null;
      try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
      if (!res.ok) {
        const detail = data?.detail ?? data?.error ?? data;
        const msg = typeof detail === 'string' ? detail : JSON.stringify(detail);
        throw new RecipeError(`SDK ${res.status}: ${msg}`, { status: res.status, detail, url });
      }
      return data;
    } catch (err) {
      if (err instanceof RecipeError) throw err;
      if (err.name === 'AbortError') throw new RecipeError(`SDK 超时（${timeout}ms）`, { url });
      throw new RecipeError(err.message || 'SDK 不可达', { url });
    } finally {
      clearTimeout(timer);
    }
  }

  /** 目录侧：带版本/不带版本都接受，地址里的 '/' ':' '@' 原样进路径。 */
  const registry = (p) => `${registryUrl}${p}`;
  /** 节点侧：GeoMCP 只有 POST /geomcp 一个入口。 */
  async function geomcp(method, params) {
    const res = await call(`${nodeUrl}/geomcp`, {
      method: 'POST',
      body: { jsonrpc: '2.0', id: `plat-${Date.now()}`, method, params }
    });
    if (res?.error) {
      throw new RecipeError(`GeoMCP ${res.error.code}: ${res.error.message}`, {
        status: res.error.code === 2005 ? 404 : res.error.code === 2006 ? 400 : 502,
        code: res.error.code,
        detail: res.error.data || null,
        url: `${nodeUrl}/geomcp`
      });
    }
    return res?.result;
  }

  return {
    registryUrl, nodeUrl,

    /** 列出目录里的方案；默认只看已批准 —— 未过审的方案不该出现在"可复用"里。 */
    async listRecipes({ status = null, approvedOnly = false, q = null, param = null, role = null, tag = null, namespace = null } = {}) {
      const qs = new URLSearchParams();
      if (status) qs.set('status', status);
      if (approvedOnly) qs.set('approved_only', 'true');
      if (q) qs.set('q', q);
      if (param) qs.set('param', param);
      if (role) qs.set('role', role);
      if (tag) qs.set('tag', tag);
      if (namespace) qs.set('namespace', namespace);
      const suffix = qs.toString() ? `?${qs}` : '';
      const data = await call(registry(`/recipes${suffix}`));
      return data?.recipes || [];
    },

    async getRecipe(address, { approvedOnly = false } = {}) {
      const suffix = approvedOnly ? '?approved_only=true' : '';
      return call(registry(`/recipes/${address}${suffix}`));
    },

    /** 提交方案：SDK 侧默认 pending，平台镜像状态并走自己的审批单。 */
    registerRecipe(recipe, { status = null, providerUrl = 'platform', by = null, replace = false } = {}) {
      const body = { recipe, provider_url: providerUrl, replace };
      if (status) body.status = status;
      if (by) body.submitted_by = by;
      return call(registry('/recipes'), { method: 'POST', body });
    },

    approveRecipe(address, { by = null, note = null } = {}) {
      return call(registry(`/recipes/${address}/approve`), { method: 'POST', body: { by, note } });
    },

    rejectRecipe(address, { by = null, note = null } = {}) {
      return call(registry(`/recipes/${address}/reject`), { method: 'POST', body: { by, note } });
    },

    /** 派生：新地址、新参数，源方案一个字节都不动。 */
    forkRecipe({ recipeId, namespace = null, name = null, version = null, params = null, fixed = null, title = null, providerUrl = 'platform', register = true }) {
      const body = { recipe_id: recipeId, provider_url: providerUrl, register };
      if (namespace) body.namespace = namespace;
      if (name) body.name = name;
      if (version) body.version = version;
      if (title) body.title = title;
      if (params) body.params = params;
      if (fixed) body.fixed = fixed;
      return call(registry('/recipes/fork'), { method: 'POST', body });
    },

    /**
     * 物化：把「方案 + 参数」变成一次运行的任务图。**不执行任何东西。**
     * 参数契约不满足时抛 RecipeError（status=400, field=…），平台据此高亮表单字段。
     */
    planRecipe({ recipe, params = {}, runId = 'run', resolve = false, nodeUrl: override }) {
      const target = (override || nodeUrl).replace(/\/$/, '');
      return call(`${target}/geomcp`, {
        method: 'POST',
        body: { jsonrpc: '2.0', id: `plan-${Date.now()}`, method: 'geo.plan', params: { recipe, params, run_id: runId, resolve } }
      }).then((res) => {
        if (res?.error) {
          throw new RecipeError(`GeoMCP ${res.error.code}: ${res.error.message}`, {
            status: res.error.code === 2005 ? 404 : res.error.code === 2006 ? 400 : 502,
            code: res.error.code,
            detail: res.error.data || null,
            url: `${target}/geomcp`
          });
        }
        return res?.result;
      });
    },

    /** 节点能力：据此判断这台节点能不能物化（未绑定目录时会明说原因）。 */
    async planningCapability({ nodeUrl: override } = {}) {
      const target = (override || nodeUrl).replace(/\/$/, '');
      try {
        const caps = await call(`${target}/capabilities`);
        return caps?.recipe_planning || { enabled: false, method: 'geo.plan', reason: '未声明' };
      } catch (err) {
        return { enabled: false, method: 'geo.plan', reason: err.message };
      }
    },

    health() { return call(registry('/health')); }
  };
}

module.exports = { createRecipeClient, RecipeError };
