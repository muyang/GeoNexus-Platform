<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import NavStickers from '@/components/NavStickers.vue'
import LangThemeChips from '@/components/LangThemeChips.vue'
import { useUiStore } from '@/stores/ui'
import { useMap } from '@/composables/map'
import { BASEMAPS, getBasemap } from '@/composables/basemaps'

const ui = useUiStore()
const route = useRoute()
const mapEl = ref(null)
const {
  engine, projection, mount, destroy, setEngine, setProjection,
  basemapFailed, slowBasemap, error, ready, loading, tilestats,
  basemapId, layers, setBasemap, retryBasemap, fitAll
} = useMap()

const titleKey = computed(() => route.meta.titleKey || 'nav.home')
const switcherOpen = ref(false)
const noticeDismissed = ref(false)

/** 提示只在"真失败"或"较慢"时出现，且**不遮挡**地图 —— 早先是整屏遮罩，
 *  一次瞬时超时就把地图盖住，看起来像挂了。 */
const notice = computed(() => {
  if (noticeDismissed.value) return null
  if (basemapFailed.value) {
    return { kind: 'bad', title: '底图不可用', body: error.value || ui.t('earth.mapHint') }
  }
  if (slowBasemap.value) {
    return { kind: 'warn', title: '底图加载较慢', body: `${error.value || ''}${error.value ? ' · ' : ''}图层与数据仍可用` }
  }
  return null
})

function retry() { noticeDismissed.value = false; retryBasemap() }
function dismiss() { noticeDismissed.value = true }

onMounted(async () => { await mount(mapEl.value) })
// 切换 3D 地球 / 2D 地图
async function switchEngine(name) { noticeDismissed.value = false; await setEngine(name) }
watch(() => route.query.basemap, (v) => { if (v) setBasemap(String(v)) })
</script>

<template>
  <div class="earth">
    <div ref="mapEl" class="earth-map" aria-label="地球/地图工作区" />

    <header class="earth-topbar">
      <div class="earth-brand"><span class="ico" /><span class="title">{{ ui.t('app.title') }}</span></div>
      <NavStickers />
      <div class="chips" style="margin-left:0">
        <!-- 引擎与投影：默认 3D 地球（后台可配） -->
        <button class="chip chip-btn" type="button" @click="switchEngine(engine === 'cesium' ? 'maplibre' : 'cesium')">
          {{ engine === 'cesium' ? '3D 地球 · Cesium' : '2D 地图 · MapLibre' }}
        </button>
        <button v-if="engine === 'cesium'" class="chip chip-btn" type="button" @click="setProjection(projection === '3d' ? '2d' : '3d')">
          {{ projection === '3d' ? '切到平面' : '切到地球' }}
        </button>
        <div style="position:relative">
          <button class="chip chip-btn" type="button" @click="switcherOpen = !switcherOpen">
            底图 · {{ BASEMAPS.find((b) => b.id === basemapId)?.label || basemapId }}
          </button>
          <div v-if="switcherOpen" class="sp-card" style="position:absolute; top:36px; left:0; width:200px">
            <div class="sp-body" style="padding:8px">
              <button v-for="b in BASEMAPS" :key="b.id" class="chip chip-btn"
                      style="display:flex; width:100%; margin:3px 0; justify-content:flex-start"
                      :style="b.id === basemapId ? 'border-color:var(--e-cyan); color:var(--e-ink)' : ''"
                      type="button" @click="setBasemap(b.id); switcherOpen = false">
                {{ b.label }} <span class="muted" style="margin-left:auto">{{ b.raster ? '栅格' : '矢量' }}</span>
              </button>
            </div>
          </div>
        </div>
        <button v-if="layers.length" class="chip chip-btn" type="button" @click="fitAll()">
          定位到数据 ({{ layers.length }})
        </button>
        <span v-if="tilestats.errors" class="chip" :title="tilestats.lastError">瓦片错误 {{ tilestats.errors }}</span>
      </div>
      <LangThemeChips />
    </header>

    <aside class="earth-drawer">
      <div class="sp-card sp-head">
        <span class="sp-title">{{ ui.t(titleKey) }}</span>
        <span class="muted" style="margin-left:auto">
          {{ ready ? (engine === 'cesium' ? 'globe ready' : 'map ready') : (loading ? ui.t('common.loading') : 'offline') }}
        </span>
      </div>
      <div class="sp-card" style="flex:1; min-height:0; display:flex; flex-direction:column">
        <div class="sp-body" style="flex:1"><slot /></div>
      </div>
    </aside>

    <!-- 非遮挡式提示：右下角浮层，可重试、可关闭 -->
    <div v-if="notice" class="earth-notice sp-card" :class="notice.kind">
      <div class="sp-body">
        <p style="margin:0 0 4px"><strong>{{ notice.title }}</strong></p>
        <p class="muted" style="margin:0">{{ notice.body }}</p>
        <div style="display:flex; gap:8px; margin-top:8px">
          <button class="nav-sticker" style="height:28px" type="button" @click="retry">重试</button>
          <button class="nav-sticker" style="height:28px" type="button" @click="dismiss">知道了</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.earth-notice { position: absolute; right: 372px; bottom: 16px; z-index: 7; width: 320px; }
.earth-notice.warn { border-color: color-mix(in srgb, var(--e-amber) 55%, transparent); }
.earth-notice.bad { border-color: color-mix(in srgb, var(--e-rose) 60%, transparent); }
@media (max-width: 900px) { .earth-notice { right: 16px; } }
</style>
