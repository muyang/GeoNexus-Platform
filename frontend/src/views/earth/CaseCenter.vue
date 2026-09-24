<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { caseApi } from '@/api'
import { useMap } from '@/composables/map'
import { useCaseLayers } from '@/composables/caseLayers'
import { useUiStore } from '@/stores/ui'
import { useAuthStore } from '@/stores/auth'
import SourceTag from '@/components/SourceTag.vue'
import CaseLayersPanel from '@/components/CaseLayersPanel.vue'

const ui = useUiStore(); const auth = useAuthStore(); const { fit } = useMap()
const layers = useCaseLayers()
const pane = ref('case')   // case | layers
const recipeRun = ref({ busy: false, error: '', hint: '' })
const rows = ref([]); const picked = ref(null)
const source = ref(''); const degraded = ref(false); const error = ref('')
const runs = ref([]); const busy = ref(false); const runError = ref(''); const runHint = ref('')
let timer = null

const live = computed(() => rows.value.filter((c) => c.provenance === 'live'))
const archival = computed(() => rows.value.filter((c) => c.provenance !== 'live'))
const activeRun = computed(() => runs.value.find((r) => !['succeeded', 'failed', 'cancelled', 'unknown'].includes(r.status)))

async function load() {
  const r = await caseApi.list()
  rows.value = r.rows; source.value = r.source; degraded.value = r.degraded; error.value = r.error || ''
  picked.value = rows.value[0] || null
  if (picked.value) { await loadRuns(); await layers.load(picked.value.id) }
}

/** 选中案例：装/卸四级图层。非空间案例照样加载，只是不画到地球上。 */
async function pick(c) {
  picked.value = c
  await Promise.all([loadRuns(), layers.load(c.id)])
}

/** 空间案例才上地球；非空间案例进侧栏（硬塞到地图上等于给出一个假位置）。 */
const isSpatial = (c) => Array.isArray(c?.bbox) && c.bbox.length === 4
const spatialRows = computed(() => rows.value.filter(isSpatial))
const sideRows = computed(() => rows.value.filter((c) => !isSpatial(c)))

/** 按方案运行：任务图与参数契约都来自 SDK，平台只负责提交与登记。 */
async function runRecipe() {
  if (!picked.value) return
  recipeRun.value = { busy: true, error: '', hint: '' }
  try {
    const res = await caseApi.runRecipe({ caseId: picked.value.id })
    recipeRun.value = { busy: false, error: '',
      hint: `已按任务图执行 ${res.steps?.length || 0} 步，交付物 ${res.deliverables?.length || 0} 项` }
    await Promise.all([loadRuns(), layers.load(picked.value.id)])
  } catch (e) {
    recipeRun.value = { busy: false, error: e.message,
      hint: e.body?.hint || (e.body?.field ? `参数 ${e.body.field} 不合格` : '') }
  }
}

async function loadRuns() {
  if (!picked.value) return
  try { runs.value = (await caseApi.runs(picked.value.id)).items } catch { runs.value = [] }
}

/** 一键复跑：提交 → 轮询到终态（SDK Web 的任务视图只有 5 个状态词）。 */
async function run() {
  if (!picked.value) return
  busy.value = true; runError.value = ''; runHint.value = ''
  try {
    const res = await caseApi.run(picked.value.id)
    runHint.value = `已提交：SDK 任务 ${res.run.sdkTaskId}`
    await loadRuns()
    startPolling()
  } catch (e) {
    runError.value = e.message
    if (e.body?.detail?.hint) runHint.value = e.body.detail.hint
  } finally { busy.value = false }
}

function startPolling() {
  stopPolling()
  timer = setInterval(async () => {
    if (!picked.value) return
    await loadRuns()
    if (!activeRun.value) stopPolling()
  }, 2000)
}
function stopPolling() { if (timer) { clearInterval(timer); timer = null } }

async function cancel(r) {
  try { await caseApi.cancelRun(r.id); await loadRuns() } catch (e) { runError.value = e.message }
}

function statusPill(s) {
  return ({ succeeded: 'ok', failed: 'bad', cancelled: 'warn', unknown: 'warn' })[s] || ''
}

onMounted(load)
onUnmounted(stopPolling)
</script>

<template>
  <div style="display:flex; flex-direction:column; gap:10px; height:100%">
    <SourceTag :source="source" :degraded="degraded" :error="error" />

    <div class="earth-list" style="overflow:auto; max-height:38%">
      <template v-for="(group, key) in { live, archival }" :key="key">
        <h5 class="muted" style="margin:6px 0; letter-spacing:.14em">{{ key === 'live' ? '实测运行' : '归档案例' }}</h5>
        <div v-for="c in group" :key="c.id" class="earth-card" :class="{ on: picked?.id === c.id }"
             @click="pick(c)">
          <h4>{{ c.title }}
            <span v-if="!isSpatial(c)" class="pill" style="margin-left:6px">侧栏</span>
          </h4>
          <p>{{ c.question }}</p>
          <p v-if="c.runSpec" class="mono" style="font-size:11px; margin-top:4px">
            可复跑：{{ c.runSpec.skill }}
          </p>
        </div>
      </template>
      <p v-if="!rows.length" class="empty">{{ ui.t('common.empty') }}</p>
    </div>

    <template v-if="picked">
      <div style="display:flex; gap:6px; margin:6px 0">
        <button class="chip chip-btn" type="button" :style="pane === 'case' ? 'border-color:var(--e-cyan)' : ''"
                @click="pane = 'case'">案例</button>
        <button class="chip chip-btn" type="button" :style="pane === 'layers' ? 'border-color:var(--e-cyan)' : ''"
                @click="pane = 'layers'">图层（四级）</button>
      </div>

      <CaseLayersPanel v-if="pane === 'layers'" :layers="layers" @fit="fit" />

      <template v-else>
      <dl class="kv" style="border-top:1px solid var(--e-line); padding-top:10px">
        <dt>研究区</dt><dd>{{ picked.aoi || '—' }}</dd>
        <dt>处理方式</dt><dd>{{ picked.processing || (picked.runSpec ? picked.runSpec.skill : '—') }}</dd>
        <dt>复跑声明</dt>
        <dd class="mono" style="font-size:11.5px">
          {{ picked.runSpec ? JSON.stringify(picked.runSpec) : '未声明 runSpec' }}
        </dd>
      </dl>

      <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap">
        <button class="nav-sticker" style="height:32px" type="button"
                :disabled="busy || !picked.runSpec || !auth.loggedIn" @click="run">
          {{ busy ? '提交中…' : '一键复跑' }}
        </button>
        <button class="nav-sticker" style="height:32px" type="button"
                :disabled="recipeRun.busy || !auth.loggedIn" @click="runRecipe">
          {{ recipeRun.busy ? '按方案执行…' : '按方案运行' }}
        </button>
        <button class="nav-sticker" style="height:32px" type="button" @click="loadRuns">刷新运行记录</button>
        <span v-if="!auth.loggedIn" class="muted">需登录后复跑</span>
      </div>
      <p v-if="recipeRun.error" class="pill bad" style="align-self:flex-start">{{ recipeRun.error }}</p>
      <p v-else-if="recipeRun.hint" class="muted">{{ recipeRun.hint }}</p>
      <p v-if="runError" class="pill bad" style="align-self:flex-start">{{ runError }}</p>
      <p v-else-if="runHint" class="muted">{{ runHint }}</p>

      <div class="earth-list" style="overflow:auto">
        <h5 class="muted" style="margin:2px 0; letter-spacing:.14em">运行记录</h5>
        <div v-for="r in runs" :key="r.id" class="earth-card">
          <h4 style="display:flex; gap:8px; align-items:center">
            <span class="pill" :class="statusPill(r.status)">{{ r.status }}</span>
            <span class="mono" style="font-size:11px">{{ r.skill }}</span>
          </h4>
          <p class="mono" style="font-size:11px">SDK 任务 {{ r.sdkTaskId || '—' }}</p>
          <p v-if="r.error" class="pill bad" style="margin-top:4px">{{ r.error }}</p>
          <div v-if="r.outputs" style="margin-top:6px; display:flex; flex-wrap:wrap; gap:6px">
            <a v-for="(v, k) in r.outputs" :key="k"
               :href="typeof v === 'string' ? caseApi.artifactUrl(r.id, k) : undefined"
               class="pill" style="text-decoration:none" target="_blank" rel="noopener">
              {{ k }}<template v-if="typeof v !== 'string'"> (内联)</template>
            </a>
          </div>
          <button v-if="!['succeeded','failed','cancelled','unknown'].includes(r.status)"
                  class="icon-btn" style="margin-top:6px" type="button" @click="cancel(r)">取消</button>
        </div>
        <p v-if="!runs.length" class="empty">还没有运行记录</p>
      </div>
      </template>
    </template>
  </div>
</template>
