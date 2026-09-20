<script setup>
import { computed, onMounted, ref } from 'vue'
import { cardApi } from '@/api'
import { useMap } from '@/composables/map'
import { useUiStore } from '@/stores/ui'
import SourceTag from '@/components/SourceTag.vue'

const ui = useUiStore(); const { fit } = useMap()
const rows = ref([]); const q = ref(''); const type = ref('')
const source = ref(''); const degraded = ref(false); const error = ref(''); const picked = ref(null)

const filtered = computed(() => rows.value.filter((c) =>
  (!type.value || c.type === type.value) &&
  (!q.value || `${c.id} ${c.title} ${c.provider}`.toLowerCase().includes(q.value.toLowerCase()))))
const types = computed(() => [...new Set(rows.value.map((c) => c.type))].filter(Boolean))

onMounted(async () => {
  const r = await cardApi.list()
  rows.value = r.rows; source.value = r.source; degraded.value = r.degraded; error.value = r.error || ''
})
</script>

<template>
  <div style="display:flex; flex-direction:column; gap:10px; height:100%">
    <SourceTag :source="source" :degraded="degraded" :error="error" />
    <div style="display:flex; gap:8px">
      <input v-model="q" class="earth-input" placeholder="search id / title / provider…" />
      <select v-model="type" class="earth-input" style="width:120px">
        <option value="">全部类型</option>
        <option v-for="t in types" :key="t" :value="t">{{ t }}</option>
      </select>
    </div>
    <p class="muted">{{ filtered.length }} / {{ rows.length }} 张</p>
    <div class="earth-list" style="overflow:auto">
      <div v-for="c in filtered" :key="c.id" class="earth-card" :class="{ on: picked?.id === c.id }"
           @click="picked = c; fit(c.bbox)">
        <h4>{{ c.title || c.id }}</h4>
        <p><span class="pill">{{ c.type }}</span> <span class="mono">{{ c.id }}</span></p>
      </div>
    </div>
    <dl v-if="picked" class="kv" style="border-top:1px solid var(--e-line); padding-top:10px">
      <dt>owner</dt><dd>{{ picked.owner || picked.provider || '—' }}</dd>
      <dt>visibility</dt><dd>{{ picked.visibility || 'public' }}</dd>
      <dt>ref</dt><dd class="mono">{{ picked.ref || '—' }}</dd>
    </dl>
  </div>
</template>
<style scoped>
.earth-input { height:34px; padding:0 11px; border-radius:9px; color:var(--e-ink); flex:1;
  background:rgba(14,22,40,.6); border:1px solid var(--e-line); font:inherit; font-size:13px }
select.earth-input { flex:none }
</style>
