<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import NavStickers from '@/components/NavStickers.vue'
import LangThemeChips from '@/components/LangThemeChips.vue'
import { useUiStore } from '@/stores/ui'
import { useMap } from '@/composables/map'
import { BASEMAPS, DEFAULT_BASEMAP, getBasemap } from '@/composables/basemaps'

const ui = useUiStore()
const route = useRoute()
const mapEl = ref(null)
const { mount, basemapFailed, error, ready, loading, tilestats, basemapId, layers, setBasemap, fitAll } = useMap()
const titleKey = computed(() => route.meta.titleKey || 'nav.home')
const switcherOpen = ref(false)

// 支持 ?basemap=dark-raster 深链（也用于自动化验证）
const initial = getBasemap(String(route.query.basemap || DEFAULT_BASEMAP)).id
onMounted(() => mount(mapEl.value, getBasemap(initial).style, initial))
watch(() => route.query.basemap, (v) => { if (v) setBasemap(String(v)) })
</script>

<template>
  <div class="earth">
    <div ref="mapEl" class="earth-map" aria-label="地图工作区" />
    <div v-if="basemapFailed" class="earth-map-fallback">
      <div>
        <p><strong>{{ ui.t('earth.mapHint') }}</strong></p>
        <p class="mono" style="font-size:12px">{{ error }}</p>
      </div>
    </div>

    <header class="earth-topbar">
      <div class="earth-brand"><span class="ico" /><span class="title">{{ ui.t('app.title') }}</span></div>
      <NavStickers />
      <div class="chips" style="margin-left:0">
        <div style="position:relative">
          <button class="chip chip-btn" type="button" @click="switcherOpen = !switcherOpen">
            底图 · {{ BASEMAPS.find((b) => b.id === basemapId)?.label || basemapId }}
          </button>
          <div v-if="switcherOpen" class="sp-card" style="position:absolute; top:36px; left:0; width:190px">
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
        <span v-if="tilestats.errors" class="chip" :title="tilestats.lastError">
          瓦片错误 {{ tilestats.errors }}
        </span>
      </div>
      <LangThemeChips />
    </header>

    <aside class="earth-drawer">
      <div class="sp-card sp-head">
        <span class="sp-title">{{ ui.t(titleKey) }}</span>
        <span class="muted" style="margin-left:auto">
          {{ ready ? 'map ready' : (loading ? ui.t('common.loading') : 'offline') }}
        </span>
      </div>
      <div class="sp-card" style="flex:1; min-height:0; display:flex; flex-direction:column">
        <div class="sp-body" style="flex:1"><slot /></div>
      </div>
    </aside>
  </div>
</template>
