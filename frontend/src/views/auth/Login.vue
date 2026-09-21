<script setup>
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useUiStore } from '@/stores/ui'

const auth = useAuthStore(); const ui = useUiStore(); const route = useRoute(); const router = useRouter()
const email = ref(''); const password = ref(''); const error = ref(''); const busy = ref(false)
const isDev = import.meta.env.DEV

async function submit() {
  error.value = ''; busy.value = true
  try {
    await auth.login(email.value, password.value)
    router.push(route.query.redirect || { name: 'earth-home' })
  } catch (e) {
    error.value = e.message || '登录失败'
  } finally { busy.value = false }
}
</script>

<template>
  <form class="auth-card card" @submit.prevent="submit">
    <h1>{{ ui.t('auth.signInTitle') }}</h1>
    <label>{{ ui.t('auth.email') }}<input v-model="email" type="email" required autocomplete="username" /></label>
    <label>{{ ui.t('auth.password') }}<input v-model="password" type="password" required autocomplete="current-password" /></label>
    <p v-if="error" class="error">{{ error }}</p>
    <button class="btn primary" type="submit" :disabled="busy">{{ busy ? ui.t('common.loading') : ui.t('auth.login') }}</button>
    <RouterLink class="link" :to="{ name: 'register' }">{{ ui.t('auth.toRegister') }}</RouterLink>
    <div v-if="isDev" class="demo">
      <p class="dim">演示账号（仅开发期）：</p>
      <ul>
        <li><b>admin</b> / Admin@GeoNexus2026 — 平台管理员</li>
        <li><b>member</b> / Demo@GeoNexus2026 — 机构成员（可用工作台）</li>
        <li><b>visitor</b> / Demo@GeoNexus2026 — 公众访客（只能看）</li>
      </ul>
    </div>
  </form>
</template>

<style scoped>
.auth-card { width: min(420px, 92vw); display: grid; gap: 12px; }
.auth-card h1 { margin: 0; font-size: 20px; }
.auth-card label { display: grid; gap: 6px; font-size: 13px; color: var(--p-muted); }
.auth-card input { height: 38px; padding: 0 11px; border: 1px solid var(--p-line); border-radius: 9px; font: inherit; }
.btn { height: 40px; border-radius: 10px; border: 1px solid var(--p-line-strong); font: inherit; cursor: pointer; }
.btn.primary { background: var(--p-cyan); border-color: var(--p-cyan); color: #fff; font-weight: 600; }
.error { color: #b91c1c; font-size: 13px; margin: 0; }
.link { font-size: 13px; color: var(--p-cyan-strong); }
.demo { border-top: 1px dashed var(--p-line); padding-top: 10px; font-size: 12px; }
.demo p { margin: 0 0 4px; }
.demo ul { margin: 0; padding-left: 16px; line-height: 1.7; }
</style>
