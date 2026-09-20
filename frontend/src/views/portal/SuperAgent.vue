<script setup>
import { ref } from 'vue'
import { useUiStore } from '@/stores/ui'
import { request } from '@/api/http'
const ui = useUiStore()
const goal = ref(''); const out = ref(''); const busy = ref(false)
const samples = [
  '对比亚马逊流域 2015 与 2025 的植被覆盖变化',
  '提取湄公河三角洲的地形坡度并统计可通行性',
  '汇总近十年全球夜光遥感数据的人口暴露变化'
]
async function run() {
  if (!goal.value.trim()) return
  busy.value = true; out.value = ''
  try {
    const res = await request('/api/plan', { method: 'POST', body: { goal: goal.value } })
    out.value = JSON.stringify(res, null, 2)
  } catch (e) {
    out.value = `未接 SDK Agent 规划接口（${e.message}）。\n下一步：/api/plan → geonexus.agent 的 LLMGoalPlanner；拿到 DAG 后交给 GeoTask 执行。`
  } finally { busy.value = false }
}
</script>

<template>
  <div class="page-head">
    <h1>{{ ui.t('portal.superAgent') }}</h1>
    <p>描述目标，平台把它拆成任务图（DAG）并调度执行：Agent 负责规划，GeoTask 负责状态与重试，算力由节点提供。</p>
  </div>
  <div class="card">
    <textarea v-model="goal" rows="3" style="width:100%; font:inherit; padding:10px; border:1px solid var(--p-line); border-radius:10px"
              placeholder="用一句话描述目标…" />
    <div style="display:flex; gap:8px; margin-top:10px; align-items:center">
      <button class="btn primary" style="height:36px; padding:0 16px; border-radius:9px; border:1px solid var(--p-cyan); background:var(--p-cyan); color:#fff; cursor:pointer"
              :disabled="busy" @click="run">{{ busy ? ui.t('common.loading') : '规划并执行' }}</button>
      <span class="dim">或试试：</span>
      <button v-for="s in samples" :key="s" class="tag" style="cursor:pointer; border:0" @click="goal = s">{{ s.slice(0, 14) }}…</button>
    </div>
    <pre v-if="out" class="mono" style="margin:12px 0 0; font-size:12px; white-space:pre-wrap">{{ out }}</pre>
  </div>
</template>
