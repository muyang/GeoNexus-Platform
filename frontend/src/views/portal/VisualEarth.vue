<script setup>
import { onMounted, ref } from 'vue'
import maplibregl from 'maplibre-gl'
import { cardApi } from '@/api'
import { useUiStore } from '@/stores/ui'

const ui = useUiStore()
const el = ref(null); const info = ref(''); const failed = ref(false); const count = ref(0)

onMounted(async () => {
  const cards = await cardApi.list()
  const rows = cards.rows.filter((c) => Array.isArray(c.bbox))
  count.value = rows.length
  info.value = cards.source
  const map = new maplibregl.Map({ container: el.value, style: ui.basemapLight, center: [110, 25], zoom: 2 })
  map.on('load', () => {
    for (const c of rows) {
      const ring = [[c.bbox[0], c.bbox[1]], [c.bbox[2], c.bbox[1]], [c.bbox[2], c.bbox[3]], [c.bbox[0], c.bbox[3]], [c.bbox[0], c.bbox[1]]]
      const id = `p-${c.id}`
      map.addSource(id, { type: 'geojson', data: { type: 'Feature', geometry: { type: 'Polygon', coordinates: [ring] }, properties: { title: c.title || c.id } } })
      map.addLayer({ id, type: 'fill', source: id, paint: { 'fill-color': '#06b6d4', 'fill-opacity': 0.18, 'fill-outline-color': '#0891b2' } })
    }
  })
  map.on('error', (e) => { failed.value = true; info.value = e?.error?.message || '底图不可用' })
})
</script>

<template>
  <div class="page-head">
    <h1>{{ ui.t('portal.visualEarth') }}</h1>
    <p>浅色门户视图：{{ count }} 个 GeoCard 覆盖范围已上图。深入作业请切换到莫干地球系统的「地图」。</p>
  </div>
  <div class="notice" style="margin-bottom:12px">{{ ui.t('common.source') }}：{{ info }}
    <span v-if="failed">（底图加载失败，仅显示本地覆盖范围）</span></div>
  <div ref="el" style="height:min(62vh, 620px); border:1px solid var(--p-line); border-radius:var(--p-radius); overflow:hidden" />
</template>
