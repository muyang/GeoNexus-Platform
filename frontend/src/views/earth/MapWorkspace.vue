<script setup>
import { computed, onMounted, ref } from 'vue'
import { cardApi } from '@/api'
import { useMap } from '@/composables/map'
import { useUiStore } from '@/stores/ui'
import LayerPanel from '@/components/LayerPanel.vue'
import SourceTag from '@/components/SourceTag.vue'

const ui = useUiStore()
const { syncLayers, layers, fit } = useMap()
const source = ref(''); const degraded = ref(false); const error = ref(''); const filter = ref('')
const rows = computed(() => layers.value.filter((l) => !filter.value || l.title.toLowerCase().includes(filter.value.toLowerCase())))

onMounted(async () => {
  const cards = await cardApi.list()
  source.value = cards.source; degraded.value = cards.degraded; error.value = cards.error || ''
  syncLayers(cards.rows)
})
</script>

<template>
  <div style="display:flex; flex-direction:column; gap:10px; height:100%">
    <SourceTag :source="source" :degraded="degraded" :error="error" />
    <input v-model="filter" class="earth-input" :placeholder="ui.t('layers.title') + '…'" />
    <div class="earth-list">
      <div v-for="l in rows" :key="l.id" class="earth-card" @click="fit(l.bbox)">
        <h4>{{ l.title }}</h4>
        <p class="mono">{{ l.bbox.map((n) => n.toFixed(1)).join(', ') }}</p>
      </div>
      <p v-if="!rows.length" class="empty">{{ ui.t('layers.empty') }}</p>
    </div>
  </div>
</template>
<style scoped>
.earth-input { width:100%; height:34px; padding:0 11px; border-radius:9px; color:var(--e-ink);
  background:rgba(14,22,40,.6); border:1px solid var(--e-line); font:inherit; font-size:13px }
</style>
