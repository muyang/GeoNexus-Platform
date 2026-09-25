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

// ── 物种视图：原文 Fig. 3 的视角 ────────────────────────────────────────────
//
//  原文的 Fig. 3 用**比例圆**画斑腿鹬在各优先站点占迁飞区/全球种群的份额。那些**比例没有
//  公布**，所以我们能复现、也只复现两件有据可查的事：
//
//   1. **站点选择**：补充材料的 site_species 表列出了每个站点有哪些物种达到 1% 阈值
//      （963 行 = 站点 × 物种）。选一个物种，就只留表里列了它的那些站点。
//   2. **10% / 50% 标注**：原文给了 over_10pct / over_50pct 两个**布尔**列。
//
//  不能做的事写在这里，也写在界面上：**不按比例缩放点**（比例未公布，缩放了就是编数据）。
//  点的大小仍然只表示 PC1 分档，与物种无关。

/** 论文的旗舰物种：**原文英文名 + 学名**是数据里的键，中文名是我们为教学加的显示名
 *  （数据表里只有英文名与学名，没有中文名）。 */
export const FLAGSHIP_SPECIES = [
  { english: 'Spotted Greenshank', scientific: 'Tringa guttifer', cn: '斑腿鹬', iucn: 'EN' },
  { english: 'Spoon-billed Sandpiper', scientific: 'Calidris pygmaea', cn: '勺嘴鹬', iucn: 'CR' },
  { english: 'Red-crowned Crane', scientific: 'Grus japonensis', cn: '丹顶鹤', iucn: 'VU' },
  { english: 'Siberian Crane', scientific: 'Leucogeranus leucogeranus', cn: '白鹤', iucn: 'CR' },
  { english: 'Black-faced Spoonbill', scientific: 'Platalea minor', cn: '黑脸琵鹭', iucn: 'EN' }
];

/** 物种的身份键 —— 与种子脚本的 `speciesKey()` 同一套组合，前端只做查找。 */
export const speciesKey = (english, scientific) => `${english || ''}\u0000${scientific || ''}`;

/** IUCN 等级的词与色（只有这四个等级出现在这张表里，其余留空）。 */
export const IUCN_TAG = {
  CR: { text: 'CR 极危', cls: 'tag-bad' },
  EN: { text: 'EN 濒危', cls: 'tag-warn' },
  VU: { text: 'VU 易危', cls: 'tag-warn' },
  NT: { text: 'NT 近危', cls: 'tag-mute' }
};
export const iucnTag = (code) => IUCN_TAG[code] || null;

/** 物种视图必须说清的三句话（面板直接引用，避免措辞在不同地方漂移）。 */
export const SPECIES_CAVEAT = {
  threshold: '只表示该站点在补充材料里列出了这个物种（达到 1% 种群阈值）；' +
    '**具体比例原文未公布**，所以这里不按比例缩放点，也不给百分比数字。',
  stars: '★ / ★★ 是原文 over_10pct / over_50pct 两列标注的"超过种群 10% / 50%"，是布尔标记，不是量值。'
    + '这两列在原文里**互不重叠**（963 行中没有一行同时为 True），所以 ★ 与 ★★ 是两档各自的事实，'
    + '不是"★★ 里也含 ★"的包含关系。',
  nearly: '该表的 nearly_1pct 列 963 行全部为 False（原文没有一行标它），因此界面不设"接近 1%"这一档。',
  names: '物种名与学名按原文照录；少数条目因原文换行被截断（如 "Lesser"、"Eurasian"），未做人工归并。'
};

/** 从要素属性读"这个站点在原文里有没有这个物种"，以及 10% / 50% 档。
 *  返回 0 / 1 / 2：0 = 未列出，1 = 列出且 over_10pct，2 = 列出且 over_50pct。 */
export function speciesStar(props, speciesIndex) {
  if (speciesIndex === null || speciesIndex === undefined) return 0;
  const value = Number(speciesIndex);
  if (Number.isNaN(value)) return 0;
  const p = props || {};
  if (Array.isArray(p.sp50) && p.sp50.includes(value)) return 2;
  if (Array.isArray(p.sp10) && p.sp10.includes(value)) return 1;
  return 0;
}
export const starText = (level) => (level === 2 ? '★★' : level === 1 ? '★' : '');

/** 筛选条件（面板与两个引擎**共用这一个实现**）。
 *  面板筛了、地球上没筛，等于对同一个问题给出两个答案。 */
export function passesSiteFilter(props, filter = {}) {
  const p = props || {};
  const type = p.wetland_type;
  // 只有沿海/内陆两类受开关控制；未标注类型的点跟着"至少开一类"走，不被静默丢掉
  if (type === 'coastal' || type === 'inland') {
    if (Array.isArray(filter.types) && !filter.types.includes(type)) return false;
  } else if (!Array.isArray(filter.types) || !filter.types.length) return false;
  if (filter.unprotectedOnly && p.protected === true) return false;
  // 物种：只看原文列出该物种的站点。null/undefined = 不筛（默认看全部）
  if (filter.species !== null && filter.species !== undefined) {
    if (!Array.isArray(p.sp) || !p.sp.includes(Number(filter.species))) return false;
  }
  return true;
}

/** 物种清单：从图层元数据的 `species.index`（原文的物种组合）出发，
 *  再扫一遍 147 个要素，把"每个物种选中哪些站点、涉及哪些国家"算出来。
 *
 *  只扫一遍要素就够（物种 × 站点合计 962 个组合）。计数**从要素来**，
 *  不从元数据里的冗余字段来 —— 单一来源，面板上那个数字才可信。 */
export function buildSpeciesList(sitesCollection) {
  const index = sitesCollection?.properties?.species?.index || [];
  const features = sitesCollection?.features || [];
  const rows = index.map((entry) => ({
    i: entry.i,
    key: speciesKey(entry.english, entry.scientific),
    english: entry.english || '',
    scientific: entry.scientific || '',
    iucn: entry.iucn || '',
    // 显示名：原文没给名字的条目如实写出来，不用学名去冒充物种名
    label: entry.english || '（原文未给出物种名）',
    siteRefs: [],       // 站点在 features 里的下标
    over10: [],         // 其中 over_10pct 的站点下标
    over50: [],         // 其中 over_50pct 的站点下标
    countries: []
  }));
  const countries = rows.map(() => new Set());
  features.forEach((feature, featureIndex) => {
    const p = feature?.properties || {};
    for (const i of p.sp || []) {
      const row = rows[i];
      if (!row) continue;                     // 下标越界（数据不同版本）就不认，不猜
      row.siteRefs.push(featureIndex);
      countries[i].add(p.country || '未标注国家');
    }
    for (const i of p.sp10 || []) if (rows[i]) rows[i].over10.push(featureIndex);
    for (const i of p.sp50 || []) if (rows[i]) rows[i].over50.push(featureIndex);
  });
  rows.forEach((row, i) => {
    row.countries = [...countries[i]].sort();
    row.siteCount = row.siteRefs.length;
    row.countryCount = row.countries.length;
  });
  return rows;
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
