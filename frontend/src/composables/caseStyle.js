/** 案例几何的样式与图例 —— 两个引擎共用一份，避免"地球上和面板里颜色不一样"。
 *
 *  这一版画的是**论文的真实数据**：东亚—澳大利亚迁飞区的 147 处优先湿地
 *  （Crosby et al. 2026, Scientific Reports 16:1916）。编码两条信息：
 *
 *   · **颜色 = 湿地类型**（沿海 / 内陆）—— 论文 Table 4 的核心二分，冷暖对比；
 *   · **大小 = PC1 分值**（原文的 Prioritisation Criterion 1）—— 五档，量级越高点越大。
 *
 *  两个必须讲清楚的坑：
 *   1. 原文对蒙古 11 处只给**名次**、对 PRC 15 处只给文字说明，这些站点没有 PC1 分值。
 *      不能让它们落进"PC1 最低档"——那是在编数据。它们走 `rank` 档：固定小尺寸，
 *      并在图例里写"原文未公布分值"。
 *   2. 保护状态（是否与保护地重叠）用的是补充材料 Table 3 的**粗体标记**（117 处），
 *      而正文 Table 4 记 108 处。差异原文未解释，面板两个数字都显示，不做人工对齐。 */

/** 湿地类型：沿海 = 青绿，内陆 = 琥珀。语义色，不用渐变 —— 只有两类。 */
export const WETLAND_STYLE = {
  coastal: { color: '#19d79b', label: '沿海湿地', count: null },
  inland: { color: '#ffb020', label: '内陆湿地', count: null }
};

/** 未知类型也要画出来（宁可显示成"未分类"，也不要静默丢点）。 */
export const UNKNOWN_WETLAND = { color: '#9aa7c7', label: '未标注湿地类型' };

export const wetlandStyle = (type) => WETLAND_STYLE[type] || UNKNOWN_WETLAND;

/** PC1 分档：同一色相不再分色（颜色已经给了湿地类型），只用半径表达量级。
 *  分档边界是**我们的**分箱（在对数尺度上等距），不是原文的字段 —— 原文只给分值。 */
export const SIZE_BANDS = {
  xl: { radius: 9.5, label: 'PC1 ≥ 100（最大）' },
  lg: { radius: 7.5, label: '30 ≤ PC1 < 100' },
  md: { radius: 6, label: '10 ≤ PC1 < 30' },
  sm: { radius: 4.5, label: '3 ≤ PC1 < 10' },
  xs: { radius: 3.6, label: 'PC1 < 3（最小）' },
  rank: { radius: 3.6, label: '原文未公布分值（蒙古 11 处仅有名次 / PRC 15 处仅有文字说明）' }
};
/** 图例顺序：从大到小，最后一条是"没有分值"。 */
export const SIZE_BAND_ORDER = ['xl', 'lg', 'md', 'sm', 'xs', 'rank'];

/** 与种子脚本 `pc1Band()` 同一套边界：分值 → 档位键。 */
export function pc1Band(pc1) {
  if (pc1 === null || pc1 === undefined || Number.isNaN(Number(pc1))) return 'rank';
  const value = Number(pc1);
  if (value >= 100) return 'xl';
  if (value >= 30) return 'lg';
  if (value >= 10) return 'md';
  if (value >= 3) return 'sm';
  return 'xs';
}

/** 一份几何在界面上的名字与默认开关。
 *  只有一份：147 处优先湿地。水的旧图层已经退役（合成 NDWI 演示不在这个案例里了）。 */
export const GEOMETRY_LAYERS = [
  { name: 'sites', label: '147 处优先湿地（点）', kind: 'points', defaultOn: true }
];

/** 数据来源与合成标注：**从数据里读** synthetic，不靠调用方记得传。
 *  真实数据的要素不带这个标记 ⇒ 返回 null，界面就不显示"合成为示意"。 */
export function syntheticNotice(featureCollections = {}) {
  const all = Object.values(featureCollections).flatMap((fc) => (fc?.features || []));
  const flagged = all.filter((f) => f?.properties?.synthetic === true);
  if (!all.length || !flagged.length) return null;
  return {
    synthetic: true,
    count: flagged.length,
    text: '本案例的几何与数值为合成/示意数据，仅用于演示与教学，不得作为科研或保护决策依据。'
  };
}

/** 站点要素排序：有 PC1 的按分值降序；没有分值的排在后面（蒙古按名次升序）。
 *  面板列表与表格用同一顺序 —— 不然"最大的点"和"列表第一行"对不上。 */
export function sortedSiteFeatures(sitesCollection) {
  const features = [...(sitesCollection?.features || [])];
  features.sort((a, b) => {
    const pa = a?.properties?.pc1;
    const pb = b?.properties?.pc1;
    const hasA = typeof pa === 'number' && !Number.isNaN(pa);
    const hasB = typeof pb === 'number' && !Number.isNaN(pb);
    if (hasA && hasB && pb !== pa) return pb - pa;
    if (hasA !== hasB) return hasA ? -1 : 1;
    const ra = a?.properties?.rank;
    const rb = b?.properties?.rank;
    if (typeof ra === 'number' && typeof rb === 'number' && ra !== rb) return ra - rb;
    return String(a?.properties?.site_id || '').localeCompare(String(b?.properties?.site_id || ''));
  });
  return features;
}

/** 按湿地类型统计（图例旁边显示"沿海 91 / 内陆 56"）。 */
export function wetlandCounts(sitesCollection) {
  const out = { coastal: 0, inland: 0, other: 0 };
  for (const feature of sitesCollection?.features || []) {
    const type = feature?.properties?.wetland_type;
    if (type === 'coastal' || type === 'inland') out[type] += 1;
    else out.other += 1;
  }
  return out;
}

/** 保护状态统计：`protected` = 原文补充材料的粗体标记（与保护地重叠）。 */
export function protectionCounts(sitesCollection) {
  const out = { protected: 0, unprotected: 0 };
  for (const feature of sitesCollection?.features || []) {
    if (feature?.properties?.protected === true) out.protected += 1;
    else out.unprotected += 1;
  }
  return out;
}
