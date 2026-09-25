<script setup>
/** 顶部模块导航：**唯一一份**导航来源（src/router/nav.js）。
 *
 *  改版前这里还另写了一个 items 数组，与 router/nav.js 各存一份；两处一旦不同步，
 *  就会出现"菜单里有、点进去 404"或反过来的情况。现在只读一份。
 */
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useUiStore } from '@/stores/ui'
import { useAuthStore } from '@/stores/auth'
import { navHint } from '@/router/access'
import { navModules, navAdmin } from '@/router/nav'

const route = useRoute(); const router = useRouter(); const ui = useUiStore(); const auth = useAuthStore()
const current = computed(() => route.name)
const isAdmin = computed(() => Boolean(auth.hasPerm && auth.hasPerm('system:user:list')))
const items = computed(() => (isAdmin.value ? [...navModules, ...navAdmin] : navModules))
</script>

<template>
  <nav class="app-nav" aria-label="平台模块导航">
    <button v-for="it in items" :key="it.name" class="app-nav-item"
            :class="{ on: current === it.name }" type="button"
            @click="router.push({ name: it.name })">
      {{ ui.t(it.key) }}<em v-if="navHint(it, auth) === 'login'" class="lock">·</em>
    </button>
  </nav>
</template>

<style scoped>
.app-nav { display: flex; align-items: center; gap: 2px; flex-wrap: wrap; }
.app-nav-item {
  height: 32px; padding: 0 13px; border-radius: 8px; border: 1px solid transparent;
  background: transparent; color: inherit; font: inherit; font-size: 13.5px; cursor: pointer;
  opacity: .72; transition: opacity .15s, background .15s, border-color .15s;
}
.app-nav-item:hover { opacity: 1; background: rgba(255, 255, 255, .05); }
.app-nav-item.on { opacity: 1; font-weight: 600; border-color: var(--e-cyan, #57d7ff);
  background: rgba(87, 215, 255, .10); }
/* 需要登录的入口给一个小圆点，游客仍可点击（点进去会有说明） */
.lock { font-style: normal; margin-left: 3px; opacity: .75; }
</style>
