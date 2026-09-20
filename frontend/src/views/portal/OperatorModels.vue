<script setup>
import { computed, onMounted, ref } from 'vue'
import { cardApi } from '@/api'
import { useUiStore } from '@/stores/ui'
const ui = useUiStore(); const rows = ref([]); const source = ref('')
const ops = computed(() => rows.value.filter((c) => c.type === 'skill' || c.type === 'model'))
onMounted(async () => { const r = await cardApi.list(); rows.value = r.rows; source.value = r.source })
</script>

<template>
  <div class="page-head">
    <h1>{{ ui.t('portal.operatorModels') }}</h1>
    <p>算子（GeoSkill）与模型（AI 模型卡）：声明输入输出与算力要求，由平台做算力匹配后调用。</p>
  </div>
  <p class="dim" style="margin-top:-8px">{{ ui.t('common.source') }}：{{ source }}</p>
  <div class="card-grid">
    <article v-for="c in ops" :key="c.id" class="card">
      <h3>{{ c.title || c.id }}</h3>
      <p><span class="tag">{{ c.type }}</span> <span class="mono" style="font-size:12px">{{ c.ref }}</span></p>
    </article>
  </div>
</template>
