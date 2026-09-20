<script setup>
import { onMounted, ref } from 'vue'
import { cardApi, caseApi, knowledgeApi } from '@/api'
import { useMap } from '@/composables/map'
import { useUiStore } from '@/stores/ui'
import SourceTag from '@/components/SourceTag.vue'

const ui = useUiStore()
const { syncLayers, fit } = useMap()
const stats = ref({ cards: 0, cases: 0, dataset: '—' })
const source = ref('')
const degraded = ref(false)
const recent = ref([])
const error = ref('')

onMounted(async () => {
  const [cards, cases, kg] = await Promise.all([cardApi.list(), caseApi.list(), knowledgeApi.graph()])
  stats.value.cards = cards.rows.length
  stats.value.cases = cases.rows.length
  stats.value.dataset = kg.graph?.dataset || '—'
  recent.value = cases.rows.slice(0, 3)
  source.value = cards.source
  degraded.value = cards.degraded   // 主源：GeoCard 目录。案例/知识各自带来源标签
  error.value = cards.error || ''
  syncLayers(cards.rows)
})
</script>

<template>
  <div>
    <SourceTag :source="source" :degraded="degraded" :error="error" />
    <div class="earth-list" style="margin-top:10px">
      <div class="earth-card">
        <h4>{{ ui.t('nav.geocards') }}</h4>
        <p><span class="kpi" style="font-size:22px">{{ stats.cards }}</span> 张卡片已上图（按 GeoCard 覆盖范围绘制）</p>
      </div>
      <div class="earth-card">
        <h4>{{ ui.t('nav.cases') }}</h4>
        <p>{{ stats.cases }} 个可复现案例 · GeoKG 数据集 {{ stats.dataset }}</p>
      </div>
    </div>

    <h5 class="muted" style="margin:16px 0 8px; letter-spacing:.14em">最近案例</h5>
    <div class="earth-list">
      <div v-for="c in recent" :key="c.id" class="earth-card" @click="fit((c.bbox) || [100, 20, 120, 40])">
        <h4>{{ c.title }}</h4>
        <p>{{ c.question }}</p>
      </div>
      <p v-if="!recent.length" class="empty">{{ ui.t('common.empty') }}</p>
    </div>
  </div>
</template>
