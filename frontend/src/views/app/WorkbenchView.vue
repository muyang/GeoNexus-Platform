<script setup>
/** 工作台模块（对齐参照站 ref-04）：头部（名称 + 状态标签 + 动作）→ 页签 提问/编辑/代码
 *  → 左输入 / 右结果（节点列表 + 空间范围地图卡）。
 *
 *  数据来源都是平台真实接口，没有编造：
 *   · `POST /api/plan` 返回一次规划（task + steps[{id,label,detail}] + graph）
 *   · `POST /api/jobs` 把这份规划提交成作业（本版本没有作业详情接口，提交后只回读一次状态）
 *   · 任务未声明 aoi/bbox 时，地图卡**如实说明没有范围**，而不是画一个假位置。
 */
import { computed, nextTick, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import PageShell from '@/components/PageShell.vue'
import SourceTag from '@/components/SourceTag.vue'
import { useMap } from '@/composables/map'
import { post } from '@/api/http'

const route = useRoute()
const mapEl = ref(null)
const { mount, fit, ready, loading } = useMap()

const tab = ref('ask')
const prompt = ref('')
const busy = ref(false)
const plan = ref(null)
const job = ref(null)
const error = ref('')
const notice = ref('')

const task = computed(() => plan.value?.task || null)
const steps = computed(() => plan.value?.steps || [])
const taskBbox = computed(() => {
  const b = task.value?.bbox || task.value?.aoi
  return Array.isArray(b) && b.length === 4 ? b : null
})

/** 规划：一次 POST /api/plan，返回真实的任务与步骤。 */
async function planIt() {
  busy.value = true; error.value = ''; notice.value = ''
  try {
    plan.value = await post('/api/plan', { goal: prompt.value || undefined,
      mission: prompt.value || undefined })
    job.value = null
    await nextTick()
    if (!ready.value) await mount(mapEl.value)
    if (taskBbox.value) fit(taskBbox.value)
  } catch (e) {
    error.value = e.message
  } finally { busy.value = false }
}

/** 提交成作业：平台有 POST /api/jobs，但本版本还没有作业详情接口 —— 如实说明。 */
async function submit() {
  if (!plan.value) return
  busy.value = true; error.value = ''; notice.value = ''
  try {
    job.value = await post('/api/jobs', { plan: plan.value, mission: prompt.value || 'workbench' })
    notice.value = '作业已创建。本版本尚未提供作业详情接口（GET /api/jobs/:id 未实现），因此只能看到提交回执。'
  } catch (e) {
    error.value = e.message
  } finally { busy.value = false }
}

function onKeydown(event) {
  if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); planIt() }
}

onMounted(async () => {
  await mount(mapEl.value)
  if (String(route.query.case || '')) prompt.value = `围绕案例 ${route.query.case} 描述一次分析任务`
  await planIt()
})
</script>

<template>
  <PageShell title="工作台" subtitle="用一句话描述任务，得到可审阅的步骤、参数与执行记录；规划走平台的 /api/plan。">
    <template #actions>
      <em class="tag" :class="plan ? 'tag-ok' : 'tag-warn'">{{ plan ? '已生成规划' : '尚未规划' }}</em>
      <em class="tag">本地执行</em>
      <button class="btn-ghost" type="button" :disabled="busy || !plan" @click="submit">提交为作业</button>
      <button class="btn-ghost" type="button" :disabled="busy" @click="planIt">重新规划</button>
    </template>

    <!-- 工作流头：名称 + 修订与节点数 -->
    <div class="wf-head">
      <strong>{{ task?.title || '尚未命名的工作流' }}</strong>
      <span class="dim">{{ task?.region || '未声明区域' }} · {{ steps.length }} 个节点 ·
        危害类型 {{ task?.hazard || '—' }}</span>
      <SourceTag :source="'规划服务'" :degraded="false" :error="error" />
    </div>

    <p v-if="error" class="pill bad">{{ error }}</p>
    <p v-else-if="notice" class="dim">{{ notice }}</p>

    <!-- 页签 -->
    <div class="tabs">
      <button class="tab" :class="{ on: tab === 'ask' }" type="button" @click="tab = 'ask'">提问</button>
      <button class="tab" :class="{ on: tab === 'edit' }" type="button" @click="tab = 'edit'">编辑</button>
      <button class="tab" :class="{ on: tab === 'code' }" type="button" @click="tab = 'code'">代码</button>
    </div>

    <div class="grid">
      <!-- 左：输入 -->
      <div class="col-left">
        <template v-if="tab === 'ask'">
          <h3>向平台描述任务</h3>
          <p class="dim">规划器会基于当前能力目录提出可审阅的步骤，只生成草案，不落执行。</p>
          <div class="hint-cards">
            <div class="hint-card">
              <strong>检查当前节点顺序</strong>
              <span>确认依赖与顺序是否合理，再决定提交为作业。</span>
            </div>
            <div class="hint-card">
              <strong>调整当前筛选条件</strong>
              <span>区域、时间窗与输出目标写在提问里，规划结果随之变化。</span>
            </div>
          </div>
          <h3>从当前工作流继续</h3>
          <textarea v-model="prompt" class="prompt" rows="4"
                    placeholder="例如：评估黄海—渤海沿岸湿地近十年的水面变化，输出变化栅格与报告"
                    @keydown="onKeydown" />
          <div class="ask-row">
            <button class="btn-primary" type="button" :disabled="busy" @click="planIt">
              {{ busy ? '规划中…' : '发送' }}
            </button>
            <span class="dim">Enter 发送 · Shift+Enter 换行</span>
          </div>
        </template>

        <template v-else-if="tab === 'edit'">
          <h3>节点</h3>
          <p class="dim">当前只读展示规划结果；本版本未提供编辑与保存接口（改结构需要先接规划器的写接口）。</p>
          <ol class="node-list">
            <li v-for="(s, i) in steps" :key="s.id">
              <span class="node-num">{{ String(i + 1).padStart(2, '0') }}</span>
              <span class="node-body">
                <strong>{{ s.label || s.id }}</strong>
                <em class="tag">{{ s.id }}</em>
                <span class="node-detail">{{ s.detail || '规划器未给出说明' }}</span>
              </span>
            </li>
          </ol>
          <p v-if="!steps.length" class="dim">还没有节点 —— 先在「提问」里生成一次规划。</p>
        </template>

        <template v-else>
          <h3>规划结果（原始 JSON）</h3>
          <p class="dim">这就是平台返回的规划对象；本节可直接复制去做脚本或联调。</p>
          <pre class="code">{{ plan ? JSON.stringify(plan, null, 2) : '（尚未规划）' }}</pre>
        </template>
      </div>

      <!-- 右：结果 -->
      <div class="col-right">
        <div class="map-card">
          <div class="map-card-head">
            <span>空间范围</span>
            <span class="dim">{{ taskBbox ? '已定位到任务范围' : (ready ? '任务未声明范围' : (loading ? '加载中…' : '底图较慢（图层仍可用）')) }}</span>
          </div>
          <div ref="mapEl" class="map-card-canvas" />
          <p v-if="!taskBbox" class="map-card-note">
            这次规划没有声明 aoi / bbox，因此不在地图上定位 —— 具体范围可在「案例」或「地图」模块查看。
          </p>
        </div>

        <div class="nodes-card">
          <div class="nodes-head"><span>节点与来源</span><span class="dim">{{ steps.length }} 个</span></div>
          <ol class="node-list compact">
            <li v-for="(s, i) in steps" :key="s.id">
              <span class="node-num">{{ String(i + 1).padStart(2, '0') }}</span>
              <span class="node-body">
                <strong>{{ s.label || s.id }}</strong>
                <em class="tag">来源 {{ s.id }}</em>
              </span>
            </li>
          </ol>
          <dl class="kv" v-if="task">
            <div><dt>负责节点</dt><dd class="mono">{{ task.nodeId || '未指定' }}</dd></div>
            <div><dt>策略</dt><dd class="mono">{{ task.policyId || '未指定' }}</dd></div>
            <div><dt>能力</dt><dd class="mono">{{ (task.capabilities || []).join(', ') || '—' }}</dd></div>
          </dl>
          <p v-if="job" class="dim">作业回执：<span class="mono">{{ job.id || '—' }}</span> · {{ job.status || '—' }}</p>
        </div>
      </div>
    </div>
  </PageShell>
</template>

<style scoped>
.wf-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 6px; }
.wf-head strong { font-size: 15px; }
.dim { font-size: 12px; opacity: .66; }
.tabs { display: flex; gap: 6px; border-bottom: 1px solid var(--e-line, rgba(255,255,255,.08)); margin: 12px 0 14px; }
.tab { height: 34px; padding: 0 13px; border: 0; background: transparent; color: inherit; font: inherit;
  font-size: 13.5px; cursor: pointer; opacity: .7; border-bottom: 2px solid transparent; }
.tab.on { opacity: 1; font-weight: 600; border-bottom-color: var(--e-cyan, #57d7ff); }

.grid { display: grid; grid-template-columns: minmax(0, 1.05fr) minmax(320px, 1fr); gap: 20px; align-items: start; }
.col-left h3 { margin: 0 0 6px; font-size: 13px; letter-spacing: .04em; opacity: .85; }
.col-left h3 + .dim { margin: 0 0 10px; }
.hint-cards { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 12px 0 18px; }
.hint-card { padding: 11px 12px; border-radius: 10px; border: 1px solid var(--e-line, rgba(255,255,255,.08));
  background: rgba(255,255,255,.02); }
.hint-card strong { display: block; font-size: 12.5px; margin-bottom: 4px; }
.hint-card span { font-size: 12px; opacity: .72; line-height: 1.55; }
.prompt { width: 100%; padding: 10px 12px; border-radius: 10px; color: inherit; font: inherit; font-size: 13px;
  background: rgba(255,255,255,.03); border: 1px solid var(--e-line, rgba(255,255,255,.12)); resize: vertical; }
.ask-row { display: flex; align-items: center; gap: 10px; margin-top: 8px; }
.btn-primary { height: 34px; padding: 0 18px; border-radius: 9px; cursor: pointer; color: inherit; font: inherit;
  font-size: 13.5px; font-weight: 600; border: 1px solid var(--e-cyan, #57d7ff); background: rgba(87,215,255,.16); }
.btn-ghost { height: 30px; padding: 0 12px; border-radius: 8px; cursor: pointer; color: inherit; font: inherit;
  font-size: 12.5px; border: 1px solid var(--e-line, rgba(255,255,255,.14)); background: transparent; }
.btn-ghost:disabled, .btn-primary:disabled { opacity: .45; cursor: not-allowed; }

.map-card { border: 1px solid var(--e-line, rgba(255,255,255,.08)); border-radius: 12px; overflow: hidden; }
.map-card-head { display: flex; align-items: center; gap: 8px; padding: 8px 11px; font-size: 12.5px;
  border-bottom: 1px solid var(--e-line, rgba(255,255,255,.08)); }
.map-card-canvas { height: 260px; }
.map-card-note { margin: 0; padding: 8px 11px; font-size: 12px; opacity: .7; line-height: 1.6; }

.nodes-card { margin-top: 14px; border: 1px solid var(--e-line, rgba(255,255,255,.08)); border-radius: 12px; padding: 12px 13px; }
.nodes-head { display: flex; align-items: center; gap: 8px; font-size: 12.5px; margin-bottom: 8px; }
.node-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.node-list li { display: flex; gap: 10px; align-items: flex-start; }
.node-num { flex: none; width: 24px; text-align: right; font-family: ui-monospace, monospace; opacity: .6; font-size: 12px; }
.node-body { display: flex; flex-wrap: wrap; gap: 7px; align-items: center; font-size: 12.5px; }
.node-detail { flex-basis: 100%; opacity: .72; line-height: 1.6; }
.kv { margin: 12px 0 0; display: flex; flex-direction: column; gap: 4px; font-size: 12px; }
.kv div { display: flex; gap: 8px; }
.kv dt { flex: none; width: 70px; opacity: .6; margin: 0; }
.kv dd { margin: 0; }
.code { margin: 0; padding: 12px; border-radius: 10px; font-size: 11.5px; line-height: 1.6;
  background: rgba(0,0,0,.28); border: 1px solid var(--e-line, rgba(255,255,255,.08)); max-height: 520px; overflow: auto; }
.tag { font-style: normal; font-size: 11px; padding: 1px 7px; border-radius: 999px;
  border: 1px solid var(--e-line, rgba(255,255,255,.14)); }
.tag-ok { border-color: rgba(60,230,176,.5); }
.tag-warn { border-color: rgba(255,196,92,.6); }
.mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.pill.bad { border-color: rgba(255,107,107,.6); }
@media (max-width: 1100px) { .grid { grid-template-columns: 1fr; } .hint-cards { grid-template-columns: 1fr; } }
</style>
