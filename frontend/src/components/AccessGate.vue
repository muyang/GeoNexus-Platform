<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useUiStore } from '@/stores/ui'
import { resolveAccess, REASON } from '@/router/access'

/** 就地访问引导：不跳转、不丢上下文 —— 游客浏览不该被弹走。
 *  只有真的需要登录/权限时，才在页面内说明原因并给出入口（登录后回到原 URL）。 */
const route = useRoute(); const router = useRouter()
const auth = useAuthStore(); const ui = useUiStore()

const decision = computed(() => resolveAccess(route, auth))
const isLogin = computed(() => decision.value.reason === REASON.LOGIN)

function goLogin() {
  router.push({ name: 'login', query: { redirect: route.fullPath } })
}
function goRegister() {
  router.push({ name: 'register', query: { redirect: route.fullPath } })
}
function goBrowse() {
  router.push({ name: auth.loggedIn ? 'earth-home' : 'portal-home' })
}
</script>

<template>
  <slot v-if="decision.ok" />
  <div v-else class="gate">
    <div class="gate-card">
      <h1>{{ isLogin ? ui.t('gate.loginTitle') : ui.t('gate.permTitle') }}</h1>
      <p>{{ isLogin ? ui.t('gate.loginBody') : ui.t('gate.permBody') }}</p>
      <p v-if="!isLogin && decision.need" class="gate-need mono">{{ decision.need }}</p>
      <div class="gate-actions">
        <template v-if="isLogin">
          <button class="gate-btn primary" type="button" @click="goLogin">{{ ui.t('auth.login') }}</button>
          <button class="gate-btn" type="button" @click="goRegister">{{ ui.t('auth.register') }}</button>
        </template>
        <button class="gate-btn" type="button" @click="goBrowse">{{ ui.t('gate.browse') }}</button>
      </div>
      <p class="gate-note">{{ ui.t('gate.publicNote') }}</p>
    </div>
  </div>
</template>

<style scoped>
/* 两个壳都适用：颜色走各自的令牌 */
.gate { min-height: 60vh; display: grid; place-items: center; padding: 32px 16px; }
.gate-card { max-width: 520px; text-align: center; padding: 26px 24px; border-radius: 14px;
  border: 1px solid var(--p-line); background: var(--p-surface); box-shadow: var(--p-shadow); }
html[data-shell="earth"] .gate-card { border-color: var(--e-line); background: var(--e-glass2); color: var(--e-ink); }
.gate-card h1 { margin: 0 0 10px; font-size: 19px; }
.gate-card p { margin: 0 0 10px; font-size: 13.5px; line-height: 1.65; color: var(--p-muted); }
html[data-shell="earth"] .gate-card p { color: var(--e-dim); }
.gate-need { font-size: 12px; }
.gate-actions { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; margin: 16px 0 10px; }
.gate-btn { height: 38px; padding: 0 18px; border-radius: 10px; cursor: pointer; font: inherit;
  border: 1px solid var(--p-line-strong); background: transparent; color: inherit; }
.gate-btn.primary { background: var(--p-cyan); border-color: var(--p-cyan); color: #fff; font-weight: 600; }
html[data-shell="earth"] .gate-btn { border-color: var(--e-line); }
html[data-shell="earth"] .gate-btn.primary { background: var(--e-cyan); border-color: var(--e-cyan); color: #04121b; }
.gate-note { font-size: 12px; margin: 0; }
</style>
