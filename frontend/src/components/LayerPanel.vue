<script setup>
import { computed } from 'vue'
import { useUiStore } from '@/stores/ui'
import { useMap } from '@/composables/map'

const ui = useUiStore()
const { layers, setVisible, setOpacity, fit, colorFor } = useMap()
const groups = computed(() => ({
  data: layers.value.filter((l) => l.kind === 'data'),
  analysis: layers.value.filter((l) => l.kind === 'skill' || l.kind === 'model'),
  reference: layers.value.filter((l) => l.kind === 'knowledge' || l.kind === 'agent')
}))
</script>

<template>
  <div class="sp-card">
    <div class="sp-head"><span class="sp-title">{{ ui.t('layers.title') }}</span>
      <span class="muted" style="margin-left:auto">{{ layers.length }}</span></div>
    <div class="sp-body">
      <p v-if="!layers.length" class="empty">{{ ui.t('layers.empty') }}</p>
      <div v-for="(rows, key) in groups" :key="key" class="layer-group">
        <template v-if="rows.length">
          <h5>{{ ui.t('layers.' + key) }}</h5>
          <div v-for="l in rows" :key="l.id" class="layer-row">
            <div>
              <div class="name"><i class="layer-swatch" :style="{ background: colorFor(l.kind) }" />{{ l.title }}</div>
              <div class="meta">{{ l.kind }} · {{ ui.t('layers.opacity') }} {{ Math.round(l.opacity * 100) }}%</div>
            </div>
            <div class="acts">
              <button class="icon-btn" :title="l.visible ? ui.t('layers.hide') : ui.t('layers.show')"
                      type="button" @click="setVisible(l.id, !l.visible)">{{ l.visible ? '◉' : '○' }}</button>
              <button class="icon-btn" :title="ui.t('layers.opacity')" type="button"
                      @click="setOpacity(l.id, l.opacity >= 0.8 ? 0.35 : l.opacity + 0.25)">◐</button>
              <button class="icon-btn" title="定位" type="button" @click="fit(l.bbox)">⌖</button>
            </div>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>
