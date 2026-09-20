<script setup>
import { onMounted, ref } from 'vue'
import { workbenchApi } from '@/api'
import { useUiStore } from '@/stores/ui'
import SourceTag from '@/components/SourceTag.vue'
import { request } from '@/api/http'

const ui = useUiStore()
const flows = ref([]); const source = ref(''); const degraded = ref(false); const error = ref('')
const prompt = ref(''); const answer = ref(''); const asking = ref(false)

onMounted(async () => {
  const r = await workbenchApi.flows()
  flows.value = r.rows; source.value = r.source; degraded.value = r.degraded; error.value = r.error || ''
})

/** 智能体入口：优先调用平台 /api/plan（SDK Agent 的代理）。
 *  未接入时明确说明"未接 SDK Agent"，不假装成功（参考件的 ask 面板亦如此）。 */
async function ask() {
  if (!prompt.value.trim()) return
  asking.value = true; answer.value = ''
  try {
    const res = await request('/api/plan', { method: 'POST', body: { goal: prompt.value } })
    answer.value = JSON.stringify(res, null, 2)
  } catch (e) {
    answer.value = `未接 SDK Agent（${e.message}）。下一步：把 /api/plan 代理到 geonexus.agent 的规划接口。`
  } finally { asking.value = false }
}
</script>

<template>
  <div style="display:flex; flex-direction:column; gap:10px; height:100%">
    <SourceTag :source="source" :degraded="degraded" :error="error" />
    <div class="sp-card" style="background:linear-gradient(160deg,var(--e-prompt-fill-1),var(--e-prompt-fill-2)); border-color:var(--e-prompt-border)">
      <div class="sp-body">
        <textarea v-model="prompt" rows="3" class="earth-input" style="width:100%; resize:vertical"
                  placeholder="用一句话描述目标，例如：对比亚马逊 2015 与 2025 的植被变化" />
        <div style="display:flex; gap:8px; margin-top:8px">
          <button class="nav-sticker" style="height:32px" type="button" :disabled="asking" @click="ask">
            {{ asking ? ui.t('common.loading') : '规划' }}
          </button>
          <span class="muted" style="align-self:center">走平台 /api/plan → SDK Agent</span>
        </div>
        <pre v-if="answer" class="mono" style="white-space:pre-wrap; font-size:11.5px; margin:10px 0 0; color:var(--e-dim)">{{ answer }}</pre>
      </div>
    </div>

    <h5 class="muted" style="margin:6px 0; letter-spacing:.14em">工作流</h5>
    <div class="earth-list" style="overflow:auto">
      <div v-for="f in flows" :key="f.id" class="earth-card">
        <h4>{{ f.title || f.id }}</h4>
        <p><span class="pill" :class="{ ok: f.status === 'succeeded', warn: f.status === 'draft' }">{{ f.status }}</span>
          · {{ f.steps || (f.steps || []).length }} 步 · {{ f.lastRun || '未运行' }}</p>
      </div>
      <p v-if="!flows.length" class="empty">{{ ui.t('common.empty') }}</p>
    </div>
  </div>
</template>
<style scoped>
.earth-input { padding:9px 11px; border-radius:9px; color:var(--e-ink); font:inherit; font-size:13px;
  background:rgba(14,22,40,.6); border:1px solid var(--e-line) }
</style>
