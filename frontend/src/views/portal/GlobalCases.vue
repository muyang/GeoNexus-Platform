<script setup>
import { onMounted, ref } from 'vue'
import { caseApi } from '@/api'
import { useUiStore } from '@/stores/ui'
const ui = useUiStore(); const rows = ref([]); const source = ref('')
onMounted(async () => { const r = await caseApi.list(); rows.value = r.rows; source.value = r.source })
</script>

<template>
  <div class="page-head">
    <h1>{{ ui.t('portal.globalCases') }}</h1>
    <p>可复现的真实分析案例：每个案例给出研究区、所用数据、处理方式与产物，可直接在工作台复跑。</p>
  </div>
  <p class="dim" style="margin-top:-8px">{{ ui.t('common.source') }}：{{ source }}</p>
  <div class="card-grid">
    <article v-for="c in rows" :key="c.id" class="card">
      <h3>{{ c.title }}</h3>
      <p>{{ c.question }}</p>
      <p style="margin-top:8px"><span class="tag">{{ c.provenance === 'live' ? '实测运行' : '归档' }}</span>
        <span class="dim"> · {{ c.aoi }}</span></p>
      <p class="mono" style="font-size:12px; margin-top:6px">{{ (c.data || []).join(' · ') }}</p>
    </article>
  </div>
</template>
