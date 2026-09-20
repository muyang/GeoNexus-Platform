<script setup>
import { computed, onMounted, ref } from 'vue'
import { cardApi } from '@/api'
import { useUiStore } from '@/stores/ui'
const ui = useUiStore(); const rows = ref([]); const source = ref(''); const degraded = ref(false)
const data = computed(() => rows.value.filter((c) => c.type === 'data'))
onMounted(async () => {
  const r = await cardApi.list(); rows.value = r.rows; source.value = r.source; degraded.value = r.degraded
})
</script>

<template>
  <div class="page-head">
    <h1>{{ ui.t('portal.dataResources') }}</h1>
    <p>数据目录遵循「一数据集一卡」：每张卡记录覆盖范围、分辨率、许可与溯源出处。</p>
  </div>
  <p class="dim" style="margin-top:-8px">{{ ui.t('common.source') }}：{{ source }}
    <span v-if="degraded">· 离线演示数据</span></p>
  <div class="card-grid">
    <article v-for="c in data" :key="c.id" class="card">
      <h3>{{ c.title || c.id }}</h3>
      <p class="mono" style="font-size:12px">{{ c.id }}</p>
      <p style="margin-top:6px">provider: {{ c.provider || '—' }} · visibility: {{ c.visibility || 'public' }}</p>
    </article>
  </div>
  <p v-if="!data.length" class="dim">暂无数据卡。</p>
</template>
