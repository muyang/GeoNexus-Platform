<script setup>
/** 案例模块（对齐参照站 ref-02）：**左列表 + 右 dossier**。
 *
 *  参照站的案例页把"有哪些案例"和"这个案例是什么"分开：左窄栏是列表，
 *  右宽栏是档案（研究区域 / 问题 / 所用数据 / 处理过程）。改版前我们把列表、详情、
 *  四级图层、运行记录全塞进一个 360px 抽屉，主体（地球）反而被挤没了。
 *
 *  这里保留并收进 dossier「图层」分段的能力：四级 LOD、双时间轴、几何开关、
 *  PC1 图例、点选地点详情、血缘弧线、合成数据标注 —— 它们本来就在
 *  `useCaseLayers()` 与 `CaseLayersPanel` 里，这次只是换了个更清楚的落点。
 */
import { computed, nextTick, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PageShell from '@/components/PageShell.vue'
import CaseLayersPanel from '@/components/CaseLayersPanel.vue'
import SourceTag from '@/components/SourceTag.vue'
import { caseApi } from '@/api'
import { useMap } from '@/composables/map'
import { useCaseLayers } from '@/composables/caseLayers'
import { useAuthStore } from '@/stores/auth'
import { visibilityTag, scopeTag, runTag, dataOriginTag, typeLabel, EMPTY } from '@/lib/labels'

const route = useRoute(); const router = useRouter(); const auth = useAuthStore()
const mapEl = ref(null)
const { mount, fit, ready, mapStatus } = useMap()
const layers = useCaseLayers()

const rows = ref([]); const source = ref(''); const degraded = ref(false); const error = ref('')
const detail = ref(null)
const runState = ref({ busy: false, error: '', hint: '' })

const statusLabel = (c) => (c.status === 'published' ? '已发布' : c.status === 'draft' ? '草稿' : (c.status || '—'))
const isSpatial = (c) => Array.isArray(c?.bbox) && c.bbox.length === 4
const isLive = (c) => c?.provenance === 'live'

async function load() {
  const r = await caseApi.list()
  rows.value = r.rows; source.value = r.source; degraded.value = r.degraded; error.value = r.error || ''
  const wanted = String(route.query.case || '')
  const picked = rows.value.find((c) => c.id === wanted) || rows.value[0] || null
  if (picked) await pick(picked)
}

async function pick(c) {
  detail.value = c
  runState.value = { busy: false, error: '', hint: '' }
  // dossier 是 v-if 渲染的：第一次挂载时地图容器还不存在，
  // 必须等 DOM 出来再挂引擎（否则 mount(null) 静默返回，地图卡永远"未就绪"）。
  await nextTick()
  if (!ready.value) await mount(mapEl.value)
  await layers.load(c.id)
}

/** 按方案运行：任务图与参数契约都来自 SDK，平台只负责提交与登记。 */
async function runRecipe() {
  if (!detail.value) return
  runState.value = { busy: true, error: '', hint: '' }
  try {
    const res = await caseApi.runRecipe({ caseId: detail.value.id })
    runState.value = { busy: false, error: '',
      hint: `已按任务图执行 ${res.steps?.length || 0} 步，交付物 ${res.deliverables?.length || 0} 项` }
    await pick(detail.value)
  } catch (e) {
    runState.value = { busy: false, error: e.message,
      hint: e.body?.hint || (e.body?.field ? `参数 ${e.body.field} 不合格` : '') }
  }
}

const components = computed(() => layers.components.value || [])
const dataComponents = computed(() => components.value.filter((c) => c.role !== 'skill' && c.role !== 'compute'))
const operatorComponents = computed(() => components.value.filter((c) => c.role === 'skill' || c.role === 'compute'))
/** 研究区域的 bbox **取自数据组成项**（案例范围就是这份数据覆盖到哪里），
 *  不是编辑手填的一个数 —— 手填的框和实际点位对不上时，用户只会以为是地图错了。 */
const regionCard = computed(() =>
  dataComponents.value.find((c) => c.id === 'geocard.eaaf.rfi-priority-sites')
  || dataComponents.value.find((c) => Array.isArray(c.bbox)) || null)
const regionBbox = computed(() => regionCard.value?.bbox || detail.value?.bbox || null)
/** 案例自带的公开事实块（合计数字来自论文表格，不是平台算的） */
const facts = computed(() => layers.view.value?.facts || detail.value?.facts || null)
const headline = computed(() => {
  const t = facts.value?.totals
  if (!t) return null
  return `优先湿地 ${t.priority_sites} 处 · 沿海 ${t.coastal} / 内陆 ${t.inland} · `
    + `与保护地重叠 ${t.protected_bold_marks} 处 · 达到 1% 的物种记录 ${t.species_reaching_1pct} 条`
})
const recipe = computed(() => layers.view.value?.recipe || null)
const steps = computed(() => recipe.value?.steps || [])
const stepRuns = computed(() => {
  const map = {}
  for (const s of layers.steps.value) map[s.stepId] = s
  return map
})
// 交付物按角色分组回来（groups），但列表要按"一项一行"读：把角色带下来，
// 否则每一行都显示不出自己的角色（改版前这里读 d.role 一直是 undefined）。
const deliverables = computed(() => (layers.groups.value || [])
  .flatMap((g) => g.items.map((item) => ({ ...item, role: g.role }))))

onMounted(async () => {
  await mount(mapEl.value)
  await load()
})
// 卸载时不销毁地球：由壳在挂载时按容器复用（见 engines/cesium.mount）
</script>

<template>
  <PageShell title="案例" subtitle="把研究组织成可复用、可复跑、可交付的案例：左侧选择案例，右侧查看研究区域、数据、处理过程与图层。">
    <template #actions>
      <SourceTag :source="source" :degraded="degraded" :error="error" />
    </template>

    <div class="cases">
      <!-- 左：案例列表 -->
      <aside class="case-list">
        <p v-if="!rows.length" class="empty">
          <strong>案例库为空</strong>后端不可达时也会是这样 —— 检查 API 是否启动。
        </p>
        <button v-for="c in rows" :key="c.id" class="case-row" type="button"
                :class="{ on: detail?.id === c.id }" @click="pick(c)">
          <span class="case-row-head">
            <strong>{{ c.title }}</strong>
            <em class="tag" :class="isLive(c) ? 'tag-live' : 'tag-arch'">{{ isLive(c) ? '实测' : '存档' }}</em>
          </span>
          <span class="case-row-sub">{{ c.aoi || c.question || '未标注研究区域' }}</span>
          <span class="case-row-meta">
            {{ statusLabel(c) }}<template v-if="!isSpatial(c)"> · 非空间（侧栏展示）</template>
          </span>
        </button>
      </aside>

      <!-- 右：dossier -->
      <section v-if="detail" class="dossier">
        <header class="dossier-head">
          <h2>{{ detail.title }}</h2>
          <span class="tag" :class="isLive(detail) ? 'tag-live' : 'tag-arch'">
            {{ isLive(detail) ? '实测运行' : '存档案例' }}
          </span>
          <!-- 数据来源：从几何里读，不靠人记得加。真实数据没有 synthetic 标记 ⇒ 显示"真实数据" -->
          <span v-if="layers.siteFeatures.value.length" class="tag" :class="dataOriginTag(false).cls">
            {{ dataOriginTag(false).text }}
          </span>
          <div class="dossier-actions">
            <button class="btn-ghost" type="button" :disabled="runState.busy || !auth.loggedIn"
                    @click="runRecipe">{{ runState.busy ? '执行中…' : '按方案运行' }}</button>
            <button class="btn-ghost" type="button" @click="layers.toggleGeometry('sites')">地点开关</button>
          </div>
        </header>

        <p v-if="runState.error" class="pill bad">{{ runState.error }}</p>
        <p v-else-if="runState.hint" class="dim">{{ runState.hint }}</p>

        <div class="dossier-grid">
          <!-- 左列：文档式字段 -->
          <div class="col-text">
            <h3>研究区域</h3>
            <p class="field">{{ detail.aoi || facts?.region?.label || '未声明' }}</p>
            <p v-if="headline" class="field dim">{{ headline }}</p>
            <p class="field mono dim">
              数据范围（取自 {{ regionCard?.id || '案例 bbox' }}）：
              {{ regionBbox ? regionBbox.map((n) => n.toFixed(2)).join(', ') : '—' }}
              <template v-if="facts?.region?.countries?.length"> · {{ facts.region.countries.length }} 国：{{ facts.region.countries.join('、') }}</template>
            </p>

            <h3>问题</h3>
            <p class="field">{{ detail.question || '未声明' }}</p>

            <h3>所用数据</h3>
            <table v-if="dataComponents.length" class="kv-table">
              <thead><tr><th>资产</th><th>名称</th><th>角色</th><th>可见性</th><th>范围</th></tr></thead>
              <tbody>
                <tr v-for="c in dataComponents" :key="c.id">
                  <td class="mono">{{ c.id }}</td>
                  <td>{{ c.title || '—' }}</td>
                  <td>{{ typeLabel(c.role) }}</td>
                  <td><em class="tag" :class="visibilityTag(c.visibility).cls">{{ visibilityTag(c.visibility).text }}</em></td>
                  <td class="mono">{{ c.bbox ? c.bbox.map((n) => n.toFixed(1)).join(', ') : '—' }}</td>
                </tr>
              </tbody>
            </table>
            <p v-else class="dim">该案例未声明数据组成项。</p>

            <h3>处理过程</h3>
            <ol v-if="steps.length" class="steps">
              <li v-for="s in steps" :key="s.id">
                <span class="step-num">{{ s.id }}</span>
                <span class="step-body">
                  <strong>{{ s.kind === 'skill' ? 'EXECUTE' : s.kind.toUpperCase() }} · {{ s.uses }}</strong>
                  <em v-if="stepRuns[s.id]" class="tag" :class="runTag(stepRuns[s.id].status).cls">
                    {{ runTag(stepRuns[s.id].status).text }}
                  </em>
                  <span class="step-desc">{{ s.description || '（方案未写说明）' }}</span>
                </span>
              </li>
            </ol>
            <p v-else class="dim">该案例尚未绑定可执行方案（没有处理过程）。</p>

            <h3>交付物</h3>
            <ul v-if="deliverables.length" class="deliverables">
              <li v-for="d in deliverables" :key="d.deliverableId">
                <span class="mono">{{ d.name }}</span>
                <em class="tag">{{ typeLabel(d.role) }}</em>
                <button v-if="d.deliverableId && d.role === 'knowledge'" class="link" type="button"
                        @click="layers.openDeliverable(d.deliverableId)">查看报告 ↗</button>
              </li>
            </ul>
            <p v-else class="dim">{{ EMPTY.deliverables }}</p>

            <h3>参数契约</h3>
            <table v-if="recipe && recipe.contract && recipe.contract.length" class="kv-table">
              <thead><tr><th>参数</th><th>取值</th><th>范围</th><th>可否修改</th></tr></thead>
              <tbody>
                <tr v-for="p in recipe.contract" :key="p.name">
                  <td class="mono">{{ p.name }}</td>
                  <td class="mono">{{ recipe.params?.[p.name] ?? p.default ?? '—' }}</td>
                  <td class="mono">
                    {{ p.enum && p.enum.length ? p.enum.join(' / ')
                      : (p.minimum !== null || p.maximum !== null ? `${p.minimum ?? '−∞'} … ${p.maximum ?? '∞'}` : '—') }}
                  </td>
                  <td><em class="tag" :class="scopeTag(p.scope).cls">{{ scopeTag(p.scope).text }}</em></td>
                </tr>
              </tbody>
            </table>
            <p v-else class="dim">未绑定方案，或方案未声明参数契约。</p>
          </div>

          <!-- 右列：地图卡 + 图层面板 -->
          <div class="col-map">
            <div class="map-card">
              <div class="map-card-head">
                <span>案例范围与图层</span>
                <em v-if="layers.spatial.value" class="tag" :class="mapStatus.cls">{{ mapStatus.text }}</em>
                <em v-else class="tag tag-mute">非空间案例</em>
              </div>
              <div ref="mapEl" class="map-card-canvas" />
              <p v-if="!layers.spatial.value" class="map-card-note">
                非空间案例：只进侧栏，不上地球（没有范围就没有位置）。
              </p>
            </div>
            <CaseLayersPanel :layers="layers" @fit="fit" />
          </div>
        </div>
      </section>
      <section v-else class="dossier empty-pane">
        <p class="empty"><strong>还没有选中案例</strong>左侧列表里点一个案例，这里显示它的档案。</p>
      </section>
    </div>
  </PageShell>
</template>

<style scoped>
.cases { display: grid; grid-template-columns: 300px minmax(0, 1fr); gap: 18px; align-items: start; }

/* 左列表：一行一个案例，选中高亮 */
.case-list { display: flex; flex-direction: column; gap: 8px; }
.case-row { text-align: left; padding: 12px 13px; border-radius: 11px; cursor: pointer; color: inherit;
  font: inherit; border: 1px solid var(--e-line, rgba(255,255,255,.08)); background: rgba(255,255,255,.02); }
.case-row:hover { border-color: rgba(87,215,255,.5); }
.case-row.on { border-color: var(--e-cyan, #57d7ff); background: rgba(87,215,255,.08); }
.case-row-head { display: flex; align-items: flex-start; gap: 8px; }
.case-row-head strong { font-size: 13.5px; line-height: 1.4; }
.case-row-sub { display: block; margin-top: 5px; font-size: 12px; opacity: .72; line-height: 1.5; }
.case-row-meta { display: block; margin-top: 6px; font-size: 11.5px; opacity: .6; }

/* 右 dossier */
.dossier { border: 1px solid var(--e-line, rgba(255,255,255,.08)); border-radius: 14px;
  background: rgba(255,255,255,.02); padding: 18px 20px 22px; min-width: 0; }
.dossier.empty-pane { display: flex; align-items: center; justify-content: center; opacity: .6; min-height: 240px; }
.dossier-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.dossier-head h2 { margin: 0; font-size: 21px; }
.dossier-actions { margin-left: auto; display: flex; gap: 8px; }
.dossier-grid { display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(320px, 1fr); gap: 22px; margin-top: 16px; }
.col-text h3 { margin: 18px 0 7px; font-size: 13px; letter-spacing: .05em; opacity: .82; }
.col-text h3:first-child { margin-top: 0; }
.field { margin: 0; font-size: 13.5px; line-height: 1.75; opacity: .92; }

.kv-table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
.kv-table th, .kv-table td { border-bottom: 1px solid var(--e-line, rgba(255,255,255,.07)); padding: 6px 8px; text-align: left; }
.kv-table th { font-weight: 600; opacity: .7; font-size: 11.5px; }
.mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }

.steps { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 7px; }
.steps li { display: flex; gap: 10px; align-items: flex-start; }
.step-num { flex: none; width: 26px; text-align: right; font-family: ui-monospace, monospace; opacity: .6; font-size: 12px; }
.step-body { display: flex; flex-wrap: wrap; gap: 7px; align-items: center; font-size: 12.5px; }
.step-desc { flex-basis: 100%; opacity: .7; line-height: 1.6; }

.deliverables { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; font-size: 12.5px; }
.deliverables li { display: flex; align-items: center; gap: 8px; }
.link { opacity: .85; text-decoration: none; border-bottom: 1px dashed currentColor; }

.map-card { border: 1px solid var(--e-line, rgba(255,255,255,.08)); border-radius: 12px; overflow: hidden; }
.map-card-head { display: flex; align-items: center; gap: 8px; padding: 8px 11px; font-size: 12.5px;
  border-bottom: 1px solid var(--e-line, rgba(255,255,255,.08)); }
.map-card-canvas { height: 300px; }
.map-card-note { margin: 0; padding: 8px 11px; font-size: 12px; opacity: .7; }

.tag-live { border-color: rgba(60,230,176,.6); }
.tag-arch { opacity: .7; }
.btn-ghost { height: 30px; padding: 0 12px; border-radius: 8px; cursor: pointer; color: inherit;
  border: 1px solid var(--e-line, rgba(255,255,255,.14)); background: transparent; font: inherit; font-size: 12.5px; }
.btn-ghost:disabled { opacity: .45; cursor: not-allowed; }
.dim { font-size: 12px; opacity: .65; }
.pill.bad { border-color: rgba(255,107,107,.6); }

@media (max-width: 1100px) {
  .cases { grid-template-columns: 1fr; }
  .dossier-grid { grid-template-columns: 1fr; }
}
</style>
