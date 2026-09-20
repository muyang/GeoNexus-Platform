<script setup>
import { useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useUiStore } from '@/stores/ui'
import LangThemeChips from '@/components/LangThemeChips.vue'
import { portalNav } from '@/router/nav'
import { navHint } from '@/router/access'

const route = useRoute(); const auth = useAuthStore(); const ui = useUiStore()
</script>

<template>
  <div class="portal">
    <header class="portal-top">
      <div class="portal-brand"><span class="dot" />GeoNexus <small>{{ ui.t('app.subtitle') }}</small></div>
      <div class="spacer" />
      <LangThemeChips />
    </header>
    <div class="portal-body">
      <aside class="portal-side">
        <template v-for="group in portalNav" :key="group.title">
          <h4 v-if="group.items.length">{{ group.title }}</h4>
          <RouterLink v-for="it in group.items" :key="it.name" :to="{ name: it.name }">
            <span>{{ ui.t(it.key) }}</span>
            <em v-if="navHint(it, auth) === 'login'" class="nav-hint">{{ ui.t('gate.badgeLogin') }}</em>
            <em v-else-if="navHint(it, auth) === 'forbidden'" class="nav-hint dim">{{ ui.t('gate.badgePerm') }}</em>
          </RouterLink>
        </template>
      </aside>
      <main class="portal-main"><slot /></main>
    </div>
  </div>
</template>
