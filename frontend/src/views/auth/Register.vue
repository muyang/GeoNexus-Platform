<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useUiStore } from '@/stores/ui'

const auth = useAuthStore(); const ui = useUiStore(); const router = useRouter()
const form = ref({ name: '', email: '', password: '', org: '' })
const error = ref(''); const busy = ref(false)

async function submit() {
  error.value = ''; busy.value = true
  try {
    await auth.register({ ...form.value })
    router.push({ name: 'earth-home' })
  } catch (e) {
    error.value = e.message || '注册失败'
  } finally { busy.value = false }
}
</script>

<template>
  <form class="auth-card card" @submit.prevent="submit">
    <h1>{{ ui.t('auth.signUpTitle') }}</h1>
    <p class="notice">{{ ui.t('auth.publicNote') }}</p>
    <label>{{ ui.t('auth.name') }}<input v-model="form.name" required /></label>
    <label>{{ ui.t('auth.email') }}<input v-model="form.email" type="email" required /></label>
    <label>{{ ui.t('auth.org') }}<input v-model="form.org" placeholder="选填" /></label>
    <label>{{ ui.t('auth.password') }}<input v-model="form.password" type="password" required minlength="8" /></label>
    <p v-if="error" class="error">{{ error }}</p>
    <button class="btn primary" type="submit" :disabled="busy">{{ busy ? ui.t('common.loading') : ui.t('auth.register') }}</button>
    <RouterLink class="link" :to="{ name: 'login' }">{{ ui.t('auth.toLogin') }}</RouterLink>
  </form>
</template>

<style scoped>
.auth-card { width: min(460px, 92vw); display: grid; gap: 12px; }
.auth-card h1 { margin: 0; font-size: 20px; }
.auth-card label { display: grid; gap: 6px; font-size: 13px; color: var(--p-muted); }
.auth-card input { height: 38px; padding: 0 11px; border: 1px solid var(--p-line); border-radius: 9px; font: inherit; }
.btn { height: 40px; border-radius: 10px; border: 1px solid var(--p-line-strong); font: inherit; cursor: pointer; }
.btn.primary { background: var(--p-cyan); border-color: var(--p-cyan); color: #fff; font-weight: 600; }
.error { color: #b91c1c; font-size: 13px; margin: 0; }
.link { font-size: 13px; color: var(--p-cyan-strong); }
</style>
