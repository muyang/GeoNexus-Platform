/** 全平台共用的"说法"与"配色"：类型词表、状态标签、空状态文案。
 *
 *  为什么单独放一个文件：改版前同一个意思在三处各写一遍 ——
 *  "public" 在数据页写成 `tag-ok`、在案例页写成 `public`、在个人中心写成权限码；
 *  空状态有的写"暂无预览"、有的写"还没有…"。用户看到的是同一个平台，
 *  同一个意思就必须是同一种颜色、同一句话。所有模块从这里取词，不再各写各的。
 *
 *  约定：**未知取值一律降级为最保守的那一档**（受限），与后端可见性继承的
 *  "unresolvable ⇒ restricted" 保持一致，避免前端把受限内容显示成公开。
 */

/** 类型词表：沿用 GeoCard 自己的角色词表（data/model/skill/knowledge/compute），不另造分类。 */
export const KINDS = [
  { key: 'all', label: '全部' },
  { key: 'data', label: '数据' },
  { key: 'model', label: '模型' },
  { key: 'skill', label: '算子' },
  { key: 'knowledge', label: '知识' },
  { key: 'compute', label: '算力' }
]

export const TYPE_LABELS = Object.fromEntries(KINDS.map((k) => [k.key, k.label]))

/** 把类型键翻成中文；未知键原样返回，避免显示空白。 */
export function typeLabel(k) {
  return TYPE_LABELS[k] || k || '数据'
}

/** 可见性：标签文案 + 配色档位。未知值按"受限"处理。 */
const VISIBILITY = {
  public: { text: '公开', cls: 'tag-ok' },
  internal: { text: '内部', cls: 'tag-warn' },
  restricted: { text: '受限', cls: 'tag-bad' }
}
export function visibilityTag(v) {
  return VISIBILITY[v] || { text: v ? `${v}（未知，按受限处理）` : '受限', cls: 'tag-bad' }
}

/** 参数契约：作者钉死的值不能改，可复用的值调用方可以改。 */
export function scopeTag(scope) {
  return scope === 'fixed' ? { text: '作者钉死', cls: 'tag-warn' } : { text: '可改', cls: 'tag-ok' }
}

/** 用户登记资源的审批状态。 */
const APPROVAL = {
  pending: { text: '待审', cls: 'tag-warn' },
  approved: { text: '已通过', cls: 'tag-ok' },
  rejected: { text: '已驳回', cls: 'tag-bad' }
}
export function approvalTag(s) {
  return APPROVAL[s] || { text: s || '未知', cls: 'tag-mute' }
}

/** 作业/步骤运行状态。 */
const RUN = {
  queued: { text: '排队中', cls: 'tag-mute' },
  running: { text: '运行中', cls: 'tag-info' },
  succeeded: { text: '已完成', cls: 'tag-ok' },
  failed: { text: '失败', cls: 'tag-bad' },
  canceled: { text: '已取消', cls: 'tag-mute' }
}
export function runTag(s) {
  return RUN[s] || { text: s || '未运行', cls: 'tag-mute' }
}

/** 数据来源标签（几何/图层用的是合成还是真数据）。 */
export function dataOriginTag(synthetic) {
  return synthetic
    ? { text: '合成/示意数据', cls: 'tag-warn' }
    : { text: '真实数据', cls: 'tag-ok' }
}

/** 空状态文案：九个模块共用一套说法，措辞里都带"下一步能做什么"。 */
export const EMPTY = {
  data: '没有匹配的资源 —— 清空搜索词或切换页签试试。',
  cases: '没有匹配的案例 —— 清空搜索词或切换页签试试。',
  nodes: '还没有节点 —— 先在「提问」里生成一次规划。',
  deliverables: '还没有交付物 —— 运行一次方案后产生。',
  preview: '暂无预览',
  jobs: '还没有作业 —— 提交一次提问后会在这里看到执行回执。'
}
