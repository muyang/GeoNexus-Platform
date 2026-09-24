'use strict';
/** 可见性继承：组合案例的可见性 = **最严**的那一项。
 *
 *  规则与 SDK 的 `geonexus/geocard/visibility.py` 一致（同一套四档词表、
 *  同一个排序、"解析不到的组成按最严处理"）。这里没有直接调用 SDK，是因为
 *  判定发生在**每个列表请求**上，一次 HTTP 往返换四行比较不值得；
 *  代价是这份规则有两处实现，所以：
 *    · 词表与顺序只有一份（下面这张表），改这里必须同时改 SDK 并各自跑测试；
 *    · 平台侧的规则由 tests/api.test.mjs 的可见性用例钉住。
 *
 *  三条不可动摇的约定：
 *   1. 未声明 = `restricted`（缺省放开是访问控制里最常见的事故）；
 *   2. 组成项解析不到（不存在 / 无权看）= 整案不可见，且对外统一 404：
 *      403 等于承认"存在一个你看不到的案例"，那本身就是信息泄露；
 *   3. 可选组成项（required: false）不参与判定 —— 作者已声明缺了也能跑。
 */

/** 参与可见性判定的角色：**承载内容**的那几类。
 *  算子/算力是代码与资源，不因为"某地用了某个算子"而泄露内容；而算子常常只有一个
 *  名字（甚至不在目录里），把它算进来会让每个案例都不可见 —— 规则过严等于没有规则。 */
const GATING_ROLES = ['data', 'model', 'knowledge', 'workflow'];

/** 从最公开到最严格；顺序即排序。 */
const LEVELS = ['public', 'restricted', 'sensitive', 'secret'];
const RANK = Object.fromEntries(LEVELS.map((name, index) => [name, index]));
const DEFAULT_VISIBILITY = 'restricted';

const ALIASES = {
  '': DEFAULT_VISIBILITY,
  none: DEFAULT_VISIBILITY,
  unknown: DEFAULT_VISIBILITY,
  internal: 'restricted',
  private: 'restricted',
  confidential: 'sensitive',
  'top-secret': 'secret',
  top_secret: 'secret'
};

function normalizeVisibility(value) {
  if (value === null || value === undefined) return DEFAULT_VISIBILITY;
  const text = String(value).trim().toLowerCase();
  if (text in RANK) return text;
  return ALIASES[text] || DEFAULT_VISIBILITY;
}

/** 取最严的一档。空集合回落到默认档（受限），不是 public。 */
function composeVisibility(levels) {
  const normalized = [...levels].map(normalizeVisibility);
  if (!normalized.length) return DEFAULT_VISIBILITY;
  // 注意：不能拿 DEFAULT_VISIBILITY 当 reduce 的种子 —— 那样"全是 public"也会被
  // 抬成 restricted，于是公开案例对访客一律 404（这个 bug 真出现过）。
  return normalized.reduce((acc, level) => (RANK[level] > RANK[acc] ? level : acc));
}

/**
 * 判定一个组合的可见性。
 *
 * @param {object} input
 * @param {string} [input.own]            组合自身的档位
 * @param {Array<{id:string, required?:boolean, visibility?:string|null}>} [input.components]
 *        组成项：`visibility` 为 null/undefined 表示**解析不到**（不存在或无权）
 * @returns {{visibility:string, visible:boolean, levels:object, missing:string[], reason:string}}
 */
function evaluateVisibility({ own = null, components = [] } = {}) {
  const selfLevel = normalizeVisibility(own);
  const levels = { self: selfLevel };
  const missing = [];
  for (const component of components) {
    if (component.required === false) continue;       // 可选组成项：不参与判定
    if (component.role && !GATING_ROLES.includes(component.role)) continue;  // 只让内容项参与
    if (component.visibility === null || component.visibility === undefined) {
      missing.push(component.id);
      continue;
    }
    levels[component.id] = normalizeVisibility(component.visibility);
  }
  if (missing.length) {
    return {
      visibility: 'secret',
      visible: false,
      levels,
      missing,
      reason: `组成项无法解析：${missing.join(', ')}（不存在或当前不可见，两种情况同等对待）`
    };
  }
  return {
    visibility: composeVisibility(Object.values(levels)),
    visible: true,
    levels,
    missing: [],
    reason: ''
  };
}

/** 已授权的档位是否够得着该案（要够得着**最严**的那一项，不是其中一项）。 */
function canSee(visibility, granted = []) {
  const allowed = [...granted].map(normalizeVisibility);
  const need = RANK[normalizeVisibility(visibility)];
  return allowed.some((level) => RANK[level] >= need);
}

module.exports = { LEVELS, RANK, GATING_ROLES, DEFAULT_VISIBILITY, normalizeVisibility, composeVisibility, evaluateVisibility, canSee };
