<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useUiStore } from '@/stores/ui'

const items = [
  { name: 'earth-home', key: 'nav.home' },
  { name: 'map', key: 'nav.map' },
  { name: 'geocards', key: 'nav.geocards' },
  { name: 'cases', key: 'nav.cases' },
  { name: 'workbench', key: 'nav.workbench' },
  { name: 'account', key: 'nav.account' }
]
const route = useRoute(); const router = useRouter(); const ui = useUiStore()
const current = computed(() => route.name)
</script>

<template>
  <nav class="nav-stickers" aria-label="莫干地球系统导航">
    <button v-for="it in items" :key="it.name" class="nav-sticker"
            :class="{ on: current === it.name }" type="button"
            @click="router.push({ name: it.name })">
      {{ ui.t(it.key) }}
    </button>
  </nav>
</template>
