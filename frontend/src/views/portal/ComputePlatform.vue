<script setup>
import { onMounted, ref } from 'vue'
import { systemApi } from '@/api'
import { useUiStore } from '@/stores/ui'
const ui = useUiStore(); const health = ref(null); const err = ref('')
onMounted(async () => { health.value = await systemApi.health() })
</script>

<template>
  <div class="page-head">
    <h1>{{ ui.t('portal.computePlatform') }}</h1>
    <p>算力节点清单与占用观测。OGE 是默认资源节点；平台未来接入其他 GeoNode 时不改前端。</p>
  </div>
  <div class="card-grid">
    <div class="card"><h3>OGE（默认节点）</h3><p>数据中心 · 计算中心 · AI 中心 · 国产化适配</p>
      <p style="margin-top:8px"><span class="tag">默认</span></p></div>
    <div class="card"><h3>其他 GeoNode</h3><p>高校 / 机构自有节点，经 GeoMCP 注册即可加入联邦</p>
      <p style="margin-top:8px"><span class="tag">待接入</span></p></div>
    <div class="card"><h3>平台健康</h3><p class="kpi">{{ health?.status || '—' }}</p>
      <p class="mono" style="font-size:12px">{{ err || '平台 /api/health' }}</p></div>
  </div>
  <div class="notice" style="margin-top:14px">
    队列与占用（Scheduler 的 capacity / occupancy / queue depth）待接入：SDK 侧已具备
    <span class="mono">Scheduler.stats()</span>，前端只需一个只读代理端点。
  </div>
</template>
