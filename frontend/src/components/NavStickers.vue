<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useUiStore } from '@/stores/ui'
import { useAuthStore } from '@/stores/auth'
import { navHint } from '@/router/access'

const items = [
  { name: 'earth-home', key: 'nav.home', access: 'public' },
  { name: 'map', key: 'nav.map', access: 'public' },
  { name: 'geocards', key: 'nav.geocards', access: 'public' },
  { name: 'cases', key: 'nav.cases', access: 'public' },
  { name: 'workbench', key: 'nav.workbench', access: 'auth' },
  { name: 'account', key: 'nav.account', access: 'auth' }
]
const route = useRoute(); const router = useRouter(); const ui = useUiStore(); const auth = useAuthStore()
const current = computed(() => route.name)
</script>

<style scoped>
/* 需要登录的入口给一个小圆点，游客仍可点击（点进去会有说明） */
.lock { font-style: normal; margin-left: 3px; opacity: .75; }
</style>

<template>
  <nav class="nav-stickers" aria-label="莫干地球系统导航">
    <button v-for="it in items" :key="it.name" class="nav-sticker"
            :class="{ on: current === it.name }" type="button"
            @click="router.push({ name: it.name })">
      {{ ui.t(it.key) }}<em v-if="navHint(it, auth) === 'login'" class="lock">·</em>
    </button>
  </nav>
</template>
