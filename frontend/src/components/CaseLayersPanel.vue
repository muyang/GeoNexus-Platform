<script setup>
import { computed, ref } from 'vue'
import { typeLabel, runTag, EMPTY } from '@/lib/labels'
import {
  GEOMETRY_LAYERS, SIZE_BANDS, SIZE_BAND_ORDER, UNKNOWN_WETLAND, WETLAND_STYLE, wetlandStyle
} from '@/composables/caseStyle'

/** 案例图层面板：四级 LOD + 双时间轴 + 血缘弧线开关 + 报告联动。
 *
 *  这一版画的是**论文的真实数据**：EAAF 的 147 处优先湿地。面板要回答的问题
 *  只有三个：点在哪、颜色和大小的意思是什么、这个数字是从哪来的。
 *
 *  设计取舍写在界面上，不只写在注释里：
 *   · 血缘弧线**默认关**——一开就是一堆线，默认开等于默认看不清；
 *   · 两根时间轴**分开画**——数据时间与执行时间混在一根轴上会让人误判因果；
 *   · 非空间案例**不上地球**——硬塞到地图上只会给出一个假的位置；
 *   · 筛选条件与地球**同一套**（`l.siteFilter`）——面板筛了地球没筛，等于给出两个答案。 */

const props = defineProps({
  layers: { type: Object, required: true }   // useCaseLayers() 的返回值
})
defineEmits(['fit'])
const l = props.layers
/** 站点列表默认折叠一部分：147 行全铺开会把面板撑成一条长龙 */
const listLimit = ref(12)

const fmt = (iso) => (iso ? String(iso).replace('T', ' ').slice(0, 16) : '—')
const current = computed(() => l.currentStep.value)
const spatialComponents = computed(() => l.components.value.filter((c) => Array.isArray(c.bbox)))

const palette = computed(() => {
  const totals = l.wetlandTotals.value
  const rows = [
    { key: 'coastal', ...WETLAND_STYLE.coastal, count: totals.coastal },
    { key: 'inland', ...WETLAND_STYLE.inland, count: totals.inland }
  ]
  if (totals.other) rows.push({ key: 'other', ...UNKNOWN_WETLAND, count: totals.other })
  return rows
})

/** 保护状态的两套口径：都显示，不做人工对齐（原文没解释 9 处的差）。 */
const protection = computed(() => {
  const totals = l.protectionTotals.value
  const table4 = l.view.value?.facts?.totals?.protected_table4
  return {
    bold: totals.protected,
    table4: typeof table4 === 'number' ? table4 : null,
    gap: typeof table4 === 'number' ? totals.protected - table4 : null,
    belowThreshold: l.view.value?.facts?.totals?.prc_below_threshold ?? null
  }
})

const listRows = computed(() => l.visibleSites.value.slice(0, listLimit.value))
const scoreText = (p) => (typeof p?.pc1 === 'number' && p.pc1 !== null
  ? `PC1 ${p.pc1}`
  : (p?.rank !== null && p?.rank !== undefined ? `名次 ${p.rank}` : '原文未公布分值'))
</script>

<template>
  <div class="sp-card">
    <div class="sp-head">
      <span class="sp-title">{{ l.view.value?.title || '案例图层' }}</span>
      <span class="muted" style="margin-left:auto">{{ l.levelsOn.value.L1 ? l.arclines.value.length : 0 }} 项可定位</span>
    </div>

    <div class="sp-body">
      <p v-if="l.loading.value" class="muted">加载中…</p>
      <p v-else-if="l.error.value" class="pill bad">{{ l.error.value }}</p>

      <template v-else-if="l.view.value">
        <p v-if="!l.spatial.value" class="muted">
          非空间案例：只进侧栏，不上地球（没有范围就没有位置，硬画等于造假）。
        </p>

        <!-- L1 案例范围 -->
        <div class="layer-group">
          <h5>L1 · 案例范围</h5>
          <div class="layer-row">
            <div>
              <div class="name">{{ l.spatial.value ? 'AOI 面' : '无空间范围' }}</div>
              <div class="meta mono">
                {{ l.view.value.bbox ? l.view.value.bbox.map((n) => n.toFixed(2)).join(', ') : '—' }}
              </div>
            </div>
            <div class="acts">
              <button class="icon-btn" type="button" :disabled="!l.spatial.value"
                      @click="l.levelsOn.value.L1 = !l.levelsOn.value.L1">{{ l.levelsOn.value.L1 ? '◉' : '○' }}</button>
              <button class="icon-btn" title="定位" type="button" :disabled="!l.spatial.value"
                      @click="l.view.value.bbox && $emit('fit', l.view.value.bbox)">⌖</button>
            </div>
          </div>

          <!-- 血缘弧线：默认关 -->
          <div class="layer-row">
            <div>
              <div class="name">血缘弧线</div>
              <div class="meta">
                默认关 · 只画选中案例 · 可定位组成项 {{ spatialComponents.length }} / {{ l.components.value.length }}
              </div>
            </div>
            <div class="acts">
              <button class="icon-btn" type="button" :disabled="!l.spatial.value || !spatialComponents.length"
                      @click="l.provenanceOn.value = !l.provenanceOn.value">{{ l.provenanceOn.value ? '◉' : '○' }}</button>
            </div>
          </div>
          <div v-if="l.provenanceOn.value" class="meta" style="margin-top:6px">
            <div v-for="c in l.components.value" :key="c.id" class="mono" style="font-size:11px">
              {{ typeLabel(c.role) }} · {{ c.id }}
              <template v-if="!c.bbox">（无范围，不画）</template>
              <template v-else-if="c.visibility !== 'public'">（{{ c.visibility }}）</template>
            </div>
          </div>
        </div>

        <!-- 合成/示意标注：从要素属性里读，不靠人记得加。真实数据不带这个标记 ⇒ 不显示 -->
        <el-alert v-if="l.notice.value" type="warning" :closable="false" style="margin-bottom:8px"
                  :title="l.notice.value.text" />

        <!-- 真实几何：147 个点，颜色 = 湿地类型、大小 = PC1 分档 -->
        <div class="layer-group">
          <h5>案例几何（矢量，来自平台受控接口）</h5>
          <p v-if="l.geometryError.value" class="pill bad">{{ l.geometryError.value }}</p>
          <div v-for="g in GEOMETRY_LAYERS" :key="g.name" class="layer-row">
            <div>
              <div class="name">{{ g.label }}</div>
              <div class="meta mono">
                {{ l.siteFeatures.value.length }} 个点 ·
                显示 {{ l.visibleSites.value.length }}<template v-if="l.hiddenByFilter.value"> (筛掉 {{ l.hiddenByFilter.value }})</template>
              </div>
            </div>
            <div class="acts">
              <button class="icon-btn" type="button"
                      @click="l.toggleGeometry(g.name)">{{ l.geometryOn.value[g.name] ? '◉' : '○' }}</button>
            </div>
          </div>

          <!-- 筛选：与地球用同一套条件（l.siteFilter） -->
          <div class="meta" style="margin-top:8px">只看（按湿地类型）</div>
          <div class="legend-row" v-for="row in palette" :key="row.key">
            <button v-if="row.key !== 'other'" class="swatch" type="button"
                    :style="{ background: row.color, opacity: (l.wetlandOn.value[row.key] === false) ? .25 : 1 }"
                    :title="`只看${row.label}`"
                    @click="l.toggleWetland(row.key)" />
            <i v-else class="dot sm" :style="{ background: row.color }" />
            <label class="legend-label">
              <input v-if="row.key !== 'other'" type="checkbox" :checked="l.wetlandOn.value[row.key] !== false"
                     @change="l.toggleWetland(row.key, $event.target.checked)" />
              {{ row.label }} <em class="mono">{{ row.count }}</em>
            </label>
          </div>
          <label class="legend-label" style="margin-top:6px">
            <input type="checkbox" :checked="l.unprotectedOnly.value"
                   @change="l.unprotectedOnly.value = $event.target.checked" />
            只看未与保护地重叠（<span class="mono">{{ l.protectionTotals.value.unprotected }}</span> 处）
          </label>

          <!-- 图例：颜色说什么、大小说什么 -->
          <div class="meta" style="margin-top:10px">图例 · 颜色 = 湿地类型，大小 = PC1 分值</div>
          <div v-for="key in SIZE_BAND_ORDER" :key="key" class="legend-row">
            <i class="dot" :style="{ width: SIZE_BANDS[key].radius * 2 + 'px',
                                     height: SIZE_BANDS[key].radius * 2 + 'px',
                                     background: 'rgba(255,255,255,.85)' }" />
            <span class="meta">{{ SIZE_BANDS[key].label }}</span>
          </div>
          <p class="meta" style="margin-top:4px">
            点的大小是<b>我们的分箱</b>（原文只给分值），边界写在这里；颜色只有沿海/内陆两类。
          </p>

          <!-- 两个口径问题：照实写出来，不藏 -->
          <div class="caveat">
            <p>
              <b>保护状态的两套口径</b>：本图层按补充材料 Table 3 的粗体标记着色，共
              <span class="mono">{{ protection.bold }}</span> 处与保护地重叠；
              正文 Table 4 记 <span class="mono">{{ protection.table4 ?? '—' }}</span> 处「受保护或部分受保护」<template
                v-if="protection.gap !== null">，相差 <span class="mono">{{ protection.gap }}</span> 处</template>。
              原文没有解释这个差异，所以两个数字都保留，不做人工对齐。
              <template v-if="protection.belowThreshold !== null">
                另有 <span class="mono">{{ protection.belowThreshold }}</span> 处 PRC 站点分值低于原文声明的阈值
                10、却仍在公开名单里，同样照实标出。
              </template>
            </p>
            <p>
              <b>原始计数数据受限</b>：支撑 PC1 的逐笔水鸟计数由 Wetlands International 许可提供、
              论文声明未公开。本案例只呈现论文公开发表的站点级结果，<b>不复算</b> PC1。
            </p>
            <p v-if="l.sitesMeta.value && l.sitesMeta.value.source" class="meta">
              来源：{{ l.sitesMeta.value.source.citation }} DOI {{ l.sitesMeta.value.source.doi }}
              （{{ l.sitesMeta.value.source.license }}）
            </p>
          </div>
        </div>

        <!-- 点选地点：与地图点击、列表点击同一份状态 -->
        <div class="layer-group">
          <h5>地点详情</h5>
          <p v-if="!l.selectedSite.value" class="muted">在地图上点一个点，或点下面的行</p>
          <template v-else>
            <dl class="kv">
              <dt>地点</dt><dd>{{ l.selectedSite.value.name || l.selectedSite.value.site_id }}</dd>
              <dt>国家</dt><dd>{{ l.selectedSite.value.country }}</dd>
              <dt>类型</dt><dd>{{ wetlandStyle(l.selectedSite.value.wetland_type).label }}</dd>
              <dt>PC1</dt>
              <dd>
                <template v-if="typeof l.selectedSite.value.pc1 === 'number'">{{ l.selectedSite.value.pc1 }}</template>
                <template v-else>原文未公布分值<template
                  v-if="l.selectedSite.value.rank !== null && l.selectedSite.value.rank !== undefined">（名次 {{ l.selectedSite.value.rank }}）</template></template>
              </dd>
              <dt>达标物种</dt><dd>{{ l.selectedSite.value.species_count }}</dd>
              <dt>其中受威胁</dt><dd>{{ l.selectedSite.value.threatened || '—' }}</dd>
              <dt>框架指定</dt><dd>{{ l.selectedSite.value.designations || '—' }}</dd>
              <dt>保护地重叠</dt><dd>{{ l.selectedSite.value.protected ? '是（原文粗体标记）' : '否' }}</dd>
            </dl>
          </template>

          <div class="meta" style="margin-top:8px">
            按 PC1 降序（未公布分值的排在后面）· 命中 {{ l.visibleSites.value.length }} / {{ l.siteFeatures.value.length }}
          </div>
          <div class="site-list">
            <div v-for="f in listRows" :key="f.properties.site_id" class="site-row"
                 :style="l.selectedSite.value && l.selectedSite.value.site_id === f.properties.site_id
                   ? 'background:rgba(255,176,32,.12);border-radius:6px' : ''">
              <div style="cursor:pointer" @click="l.selectSite(f.properties)">
                <div class="name">
                  <i class="dot sm" :style="{ background: wetlandStyle(f.properties.wetland_type).color }" />
                  {{ f.properties.name }}
                </div>
                <div class="meta mono">
                  {{ f.properties.country }} · {{ scoreText(f.properties) }} · 达标物种 {{ f.properties.species_count }}
                  <template v-if="!f.properties.protected"> · 未与保护地重叠</template>
                </div>
              </div>
            </div>
          </div>
          <button v-if="l.visibleSites.value.length > listLimit" class="more" type="button"
                  @click="listLimit = listLimit === 12 ? l.visibleSites.value.length : 12">
            {{ listLimit === 12 ? `展开全部 ${l.visibleSites.value.length} 行` : '收起' }}
          </button>
        </div>

        <!-- L2 步骤足迹 + 播放 -->
        <div class="layer-group">
          <h5>L2 · 步骤足迹</h5>
          <div class="layer-row">
            <div style="flex:1">
              <div class="name">
                第 {{ l.steps.value.length ? l.stepIndex.value + 1 : 0 }} / {{ l.steps.value.length }} 步
                <span v-if="current" class="mono" style="margin-left:6px">{{ current.stepId }} · {{ current.skill }}</span>
              </div>
              <div class="meta">
                {{ current ? `${fmt(current.startedAt)} → ${fmt(current.finishedAt)}` : '无运行记录' }}
                <em v-if="current" class="tag" :class="runTag(current.status).cls">{{ runTag(current.status).text }}</em>
              </div>
              <input type="range" min="0" :max="Math.max(l.steps.value.length - 1, 0)" :value="l.stepIndex.value"
                     style="width:100%" :disabled="l.steps.value.length < 2"
                     @input="l.selectStep(Number($event.target.value))" />
            </div>
            <div class="acts">
              <button class="icon-btn" type="button" :disabled="l.steps.value.length < 2" @click="l.selectStep(l.stepIndex.value - 1)">⏮</button>
              <button class="icon-btn" type="button" :disabled="l.steps.value.length < 2" @click="l.togglePlayback()">{{ l.playing.value ? '⏸' : '▶' }}</button>
              <button class="icon-btn" type="button" :disabled="l.steps.value.length < 2" @click="l.selectStep(l.stepIndex.value + 1)">⏭</button>
            </div>
          </div>
          <div v-for="(s, i) in l.steps.value" :key="s.runId" class="layer-row" :style="i === l.stepIndex.value ? 'background:rgba(87,215,255,.08);border-radius:6px' : ''">
            <div style="cursor:pointer" @click="l.selectStep(i)">
              <div class="name">{{ s.stepId }} · {{ s.skill }}</div>
              <div class="meta mono">
                {{ fmt(s.startedAt) }}
                <em class="tag" :class="runTag(s.status).cls">{{ runTag(s.status).text }}</em>
              </div>
            </div>
          </div>
        </div>

        <!-- L3 图层组（交付物按角色分组） -->
        <div class="layer-group">
          <h5>L3 · 图层组（交付物）</h5>
          <template v-for="g in l.groups.value" :key="g.role">
            <div class="meta" style="margin-top:4px">{{ typeLabel(g.role) }}</div>
            <div v-for="d in g.items" :key="d.deliverableId" class="layer-row">
              <div>
                <div class="name">{{ d.name }}</div>
                <div class="meta mono">{{ d.mediaType || '—' }} · {{ d.status }}</div>
              </div>
              <div class="acts">
                <!-- ▤ 是"内嵌预览"：只有 HTML 报告能在 iframe 里显示。
                     CSV 走浏览器就变成下载，点了像没反应 —— 所以那种只留 ↗。 -->
                <button v-if="(d.mediaType || '').includes('html')" class="icon-btn" type="button"
                        title="查看报告" :disabled="!d.deliverableId"
                        @click="l.selectDeliverable(d.deliverableId)">▤</button>
                <button v-if="d.deliverableId" class="icon-btn" type="button" title="新窗口打开"
                        @click="l.openDeliverable(d.deliverableId)">↗</button>
              </div>
            </div>
          </template>
          <p v-if="!l.groups.value.length" class="muted">{{ EMPTY.deliverables }}</p>
        </div>

        <!-- 双时间轴 -->
        <div class="layer-group">
          <h5>双时间轴</h5>
          <div class="layer-row">
            <div style="flex:1">
              <div class="name">数据时间（案例研究的时段）</div>
              <div class="meta mono">
                {{ l.timeline.value.dataTime ? `${fmt(l.timeline.value.dataTime.start)} → ${fmt(l.timeline.value.dataTime.end)}` : '未声明（站点级结果来自多个年份的多来源普查）' }}
              </div>
              <div style="height:4px;border-radius:2px;background:rgba(87,215,255,.35);margin-top:4px"></div>
            </div>
          </div>
          <div class="layer-row">
            <div style="flex:1">
              <div class="name">执行时间（这一次运行）</div>
              <div class="meta mono">
                {{ l.timeline.value.executionTime ? `${fmt(l.timeline.value.executionTime.start)} → ${fmt(l.timeline.value.executionTime.end)}` : '还没有运行' }}
              </div>
              <div style="height:4px;border-radius:2px;background:rgba(60,230,176,.35);margin-top:4px">
                <div :style="{ width: l.timeline.value.progress + '%', height: '100%', background: '#3ce6b0', borderRadius: '2px' }"></div>
              </div>
            </div>
          </div>
          <p class="meta" v-if="l.timeline.value.separate">
            两根轴分开画：结果变了，是数据换了还是重跑过？混在一根轴上就分不清。
          </p>
        </div>

        <!-- L4 报告面板联动 -->
        <div class="layer-group">
          <h5>L4 · 报告面板</h5>
          <p v-if="!l.reportLayer.value?.available" class="muted">这个案例还没有报告类交付物</p>
          <template v-else>
            <div class="layer-row">
              <div>
                <div class="name">联动方式：{{ l.reportLayer.value.linkage === 'on-select' ? '选中即展开' : '手动' }}</div>
                <div class="meta">在 L3 里点 ▤ 展开对应报告</div>
              </div>
            </div>
            <p v-if="l.reportError.value" class="muted">{{ l.reportError.value }}</p>
            <iframe v-else-if="l.reportBlobUrl.value" :src="l.reportBlobUrl.value"
                    style="width:100%;height:260px;border:1px solid var(--e-line);border-radius:8px;background:#fff"
                    title="交付物报告"></iframe>
          </template>
        </div>
      </template>
      <p v-else class="muted">选中一个案例后显示它的四级图层</p>
    </div>
  </div>
</template>

<style scoped>
input[type='range'] { accent-color:#57d7ff }
.legend-row { display:flex; align-items:center; gap:7px; margin:3px 0; }
.legend-label { display:flex; align-items:center; gap:6px; font-size:12px; opacity:.9; }
.swatch { width:14px; height:14px; padding:0; border-radius:4px; cursor:pointer;
  border:1px solid rgba(255,255,255,.25); flex:none; }
.dot { display:inline-block; border-radius:50%; flex:none; border:1px solid rgba(255,255,255,.5); }
.dot.sm { width:8px; height:8px; margin-right:4px; }
.site-list { max-height:240px; overflow:auto; margin-top:4px; }
.site-row { padding:4px 6px; }
.more { margin-top:6px; height:26px; padding:0 10px; border-radius:7px; cursor:pointer; color:inherit;
  font:inherit; font-size:12px; border:1px solid var(--e-line, rgba(255,255,255,.14)); background:transparent; }
.caveat { margin-top:10px; padding:8px 10px; border-radius:8px; font-size:11.5px; line-height:1.65;
  border:1px solid rgba(255,176,32,.35); background:rgba(255,176,32,.06); }
.caveat p { margin:0 0 6px; }
.caveat p:last-child { margin-bottom:0; }
</style>
