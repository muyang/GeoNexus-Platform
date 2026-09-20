<script setup>
import { computed, onMounted, ref } from 'vue'
import { caseApi } from '@/api'
import { useMap } from '@/composables/map'
import { useUiStore } from '@/stores/ui'
import SourceTag from '@/components/SourceTag.vue'

const ui = useUiStore(); const { fit } = useMap()
const rows = ref([]); const picked = ref(null)
const source = ref(''); const degraded = ref(false); const error = ref('')
const live = computed(() => rows.value.filter((c) => c.provenance === 'live'))
const archival = computed(() => rows.value.filter((c) => c.provenance !== 'live'))

onMounted(async () => {
  const r = await caseApi.list()
  rows.value = r.rows; source.value = r.source; degraded.value = r.degraded; error.value = r.error || ''
  picked.value = rows.value[0] || null
})
</script>

<template>
  <div style="display:flex; flex-direction:column; gap:10px; height:100%">
    <SourceTag :source="source" :degraded="degraded" :error="error" />
    <div class="earth-list" style="overflow:auto">
      <template v-for="(group, key) in { live, archival }" :key="key">
        <h5 class="muted" style="margin:6px 0; letter-spacing:.14em">{{ key === 'live' ? '实测运行' : '归档案例' }}</h5>
        <div v-for="c in group" :key="c.id" class="earth-card" :class="{ on: picked?.id === c.id }"
             @click="picked = c">
          <h4>{{ c.title }}</h4>
          <p>{{ c.question }}</p>
        </div>
      </template>
      <p v-if="!rows.length" class="empty">{{ ui.t('common.empty') }}</p>
    </div>
    <dl v-if="picked" class="kv" style="border-top:1px solid var(--e-line); padding-top:10px">
      <dt>研究区</dt><dd>{{ picked.aoi || '—' }}</dd>
      <dt>使用数据</dt><dd class="mono">{{ (picked.data || []).join(' · ') || '—' }}</dd>
      <dt>处理方式</dt><dd>{{ picked.processing || '按 GeoSkill 组合执行（见工作台）' }}</dd>
      <dt>产物</dt><dd class="mono">{{ (picked.outputs || []).join(' · ') || '—' }}</dd>
      <dt>来源</dt><dd>{{ picked.provenance === 'live' ? '实测运行' : '归档（非本次联邦运行）' }}</dd>
    </dl>
  </div>
</template>
