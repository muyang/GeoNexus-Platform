<script setup>
import { computed, watchEffect } from 'vue'
import { useRoute } from 'vue-router'
import PortalLayout from '@/layouts/PortalLayout.vue'
import EarthLayout from '@/layouts/EarthLayout.vue'
import AppLayout from '@/layouts/AppLayout.vue'
import BlankLayout from '@/layouts/BlankLayout.vue'
import AccessGate from '@/components/AccessGate.vue'

const route = useRoute()
// 会话还原由路由守卫在首次导航前完成（见 router/index.js），此处不再重复

const shell = computed(() => route.meta.shell || 'portal')
const layout = computed(() => ({ app: AppLayout, portal: PortalLayout, earth: EarthLayout, blank: BlankLayout }[shell.value]))

// 壳 → <html data-shell>，CSS 令牌与 Element Plus 变量都挂在这个属性上
watchEffect(() => { document.documentElement.dataset.shell = shell.value })
</script>

<template>
  <component :is="layout">
    <AccessGate>
      <router-view v-slot="{ Component }">
        <component :is="Component" />
      </router-view>
    </AccessGate>
  </component>
</template>
