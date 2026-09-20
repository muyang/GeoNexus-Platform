<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import NavStickers from '@/components/NavStickers.vue'
import LangThemeChips from '@/components/LangThemeChips.vue'
import { useUiStore } from '@/stores/ui'
import { useMap } from '@/composables/map'

const ui = useUiStore()
const route = useRoute()
const mapEl = ref(null)
const { mount, basemapFailed, error, ready, loading } = useMap()
const titleKey = computed(() => route.meta.titleKey || 'nav.home')

onMounted(() => mount(mapEl.value, ui.basemapDark))
watch(() => ui.basemapDark, (url) => { const m = mount(mapEl.value, url); if (m && !basemapFailed.value) m.setStyle(url) })
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
