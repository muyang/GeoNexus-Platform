/** 案例几何的样式与图例 —— 两个引擎共用一份，避免"地球上和面板里颜色不一样"。
 *
 *  图例从**数据**来（几何的 manifest 里有 bands），这里只放兜底与语义色：
 *  水面变化用冷暖对比（损失=暖、增加=青），PC1 分级用同一色相的三档明度，
 *  观众不需要记颜色，看一次图例就够了。 */

/** 水面变化分级：语义色，冷暖对比 */
export const WATER_CLASS_STYLE = {
  loss: { color: '#ff6b6b', label: '水面损失', opacity: 0.55 },
  gain: { color: '#3ce6b0', label: '水面增加', opacity: 0.55 },
  stable: { color: '#57d7ff', label: '稳定水面', opacity: 0.25 } // 面积大，默认不画
};

/** PC1 分级：同一色相三档明度（高分更亮更暖） */
export const PC1_BANDS = {
  high: { color: '#ffb020', radius: 9, label: 'PC1 ≥ 0.5（高）' },
  medium: { color: '#ffd479', radius: 7, label: '0.25 ≤ PC1 < 0.5（中）' },
  low: { color: '#ffe9bd', radius: 5, label: 'PC1 < 0.25（低）' }
};

/** 三份几何在界面上的名字与默认开关 */
export const GEOMETRY_LAYERS = [
  { name: 'water_change', label: '水面变化面', kind: 'fill', defaultOn: true },
  { name: 'water_baseline', label: '基线水面范围', kind: 'outline', defaultOn: false },
  { name: 'sites', label: '示意地点（按 PC1 分级）', kind: 'points', defaultOn: true }
];

/** 数据来源与合成标注：**从数据里读** synthetic，不靠调用方记得传。 */
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

/** 水面变化的分级统计（图例旁边显示"损失多少、增加多少"） */
export function waterClassCounts(changeCollection) {
  const out = {};
  for (const feature of changeCollection?.features || []) {
    const cls = feature?.properties?.class;
    if (!cls) continue;
    out[cls] = (out[cls] || 0) + 1;
  }
  return out;
}

/** 站点要素按 PC1 降序（点击面板用同一顺序，跟表格一致） */
export function sortedSiteFeatures(sitesCollection) {
  const features = [...(sitesCollection?.features || [])];
  features.sort((a, b) => (b?.properties?.pc1 || 0) - (a?.properties?.pc1 || 0));
  return features;
}
