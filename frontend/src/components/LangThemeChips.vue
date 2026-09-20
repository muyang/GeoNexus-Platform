<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useUiStore } from '@/stores/ui'
import { useAuthStore } from '@/stores/auth'

const ui = useUiStore(); const auth = useAuthStore(); const router = useRouter()
const shell = computed(() => document.documentElement.dataset.shell)
const isEarth = computed(() => shell.value === 'earth')

function goPortal() { router.push(isEarth.value ? { name: 'portal-home' } : { name: 'earth-home' }) }
function logout() { auth.logout(); router.push({ name: 'login' }) }
</script>

<template>
  <div class="chips">
    <span class="chip"><i class="live" />{{ ui.t('common.live') }}</span>
    <button class="chip chip-btn" type="button" @click="ui.toggleLang()">
      {{ ui.lang === 'zh' ? 'EN' : '中文' }}
    </button>
    <button class="chip chip-btn" type="button" @click="goPortal">
      {{ isEarth ? ui.t('nav.portal') : ui.t('nav.home') }}
    </button>
    <span v-if="auth.loggedIn" class="chip">{{ auth.displayName }}</span>
    <button v-if="auth.loggedIn" class="chip chip-btn" type="button" @click="logout">
      {{ ui.t('auth.logout') }}
    </button>
    <button v-else class="chip chip-btn" type="button" @click="router.push({ name: 'login' })">
      {{ ui.t('auth.login') }}
    </button>
  </div>
</template>
