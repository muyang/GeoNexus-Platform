<script setup>
/** 地图模块（对齐参照站 console）：**全屏**地球 + 浮层面板。
 *  地图是主角，控件浮在它上面，而不是把地图塞进抽屉旁边的一条。 */
import { onMounted, ref } from 'vue'
import { cardApi } from '@/api'
import { useMap } from '@/composables/map'
import { BASEMAPS } from '@/composables/basemaps'
import LayerPanel from '@/components/LayerPanel.vue'
import SourceTag from '@/components/SourceTag.vue'

const mapEl = ref(null)
const source = ref(''); const degraded = ref(false); const error = ref('')
const layersOpen = ref(true)
const {
  mount, engine, projection, setEngine, setProjection, setBasemap, basemapId,
  ready, loading, layers, fitAll, syncLayers
} = useMap()

onMounted(async () => {
  await mount(mapEl.value)
  const cards = await cardApi.list()
  source.value = cards.source; degraded.value = cards.degraded; error.value = cards.error || ''
  syncLayers(cards.rows)
})
</script>

<template>
  <div class="mapview">
    <div ref="mapEl" class="mapview-canvas" aria-label="地图工作区" />

    <div class="float float-left">
      <div class="float-head">
        <span class="float-title">图层</span>
        <button class="icon-btn" type="button" @click="layersOpen = !layersOpen">{{ layersOpen ? '–' : '+' }}</button>
      </div>
      <div v-if="layersOpen" class="float-body">
        <SourceTag :source="source" :degraded="degraded" :error="error" />
        <LayerPanel />
        <button v-if="layers.length" class="btn-ghost" type="button" @click="fitAll()">
          定位到全部数据（{{ layers.length }}）
        </button>
      </div>
    </div>

    <div class="float float-right">
      <div class="float-head"><span class="float-title">视图</span>
        <span class="dim">{{ ready ? 'globe ready' : (loading ? '加载中…' : '未就绪') }}</span>
      </div>
      <div class="float-body">
        <button class="btn-ghost" type="button" @click="setEngine(engine === 'cesium' ? 'maplibre' : 'cesium')">
          {{ engine === 'cesium' ? '切到 2D 地图' : '切到 3D 地球' }}
        </button>
        <button v-if="engine === 'cesium'" class="btn-ghost" type="button"
                @click="setProjection(projection === '3d' ? '2d' : '3d')">
          {{ projection === '3d' ? '切到平面' : '切到地球' }}
        </button>
        <div class="basemap-row">
          <button v-for="b in BASEMAPS" :key="b.id" class="chip chip-btn" type="button"
                  :class="{ on: b.id === basemapId }" @click="setBasemap(b.id)">{{ b.label }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.mapview { position: relative; flex: 1; min-height: 0; }
.mapview-canvas { position: absolute; inset: 0; }
.float { position: absolute; z-index: 2; width: 300px; max-height: calc(100% - 28px);
  display: flex; flex-direction: column; border-radius: 12px; overflow: hidden;
  border: 1px solid var(--e-line, rgba(255,255,255,.1)); background: rgba(10, 14, 24, .78);
  backdrop-filter: blur(10px); }
.float-left { left: 14px; top: 14px; }
.float-right { right: 14px; top: 14px; width: 240px; }
.float-head { display: flex; align-items: center; gap: 8px; padding: 9px 12px;
  border-bottom: 1px solid var(--e-line, rgba(255,255,255,.08)); }
.float-title { font-size: 13px; font-weight: 600; }
.float-body { padding: 10px 12px; overflow: auto; display: flex; flex-direction: column; gap: 8px; }
.dim { margin-left: auto; font-size: 11.5px; opacity: .65; }
.basemap-row { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px; }
.btn-ghost { height: 30px; padding: 0 12px; border-radius: 8px; cursor: pointer; color: inherit;
  border: 1px solid var(--e-line, rgba(255,255,255,.12)); background: transparent; font: inherit; font-size: 12.5px; }
.icon-btn { width: 24px; height: 24px; border-radius: 6px; cursor: pointer; color: inherit;
  border: 1px solid var(--e-line, rgba(255,255,255,.12)); background: transparent; }
@media (max-width: 900px) { .float { width: 220px; } }
</style>
