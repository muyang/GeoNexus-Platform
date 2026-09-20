<script setup>
import { computed, onMounted, watchEffect } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import PortalLayout from '@/layouts/PortalLayout.vue'
import EarthLayout from '@/layouts/EarthLayout.vue'
import BlankLayout from '@/layouts/BlankLayout.vue'

const route = useRoute()
const auth = useAuthStore()
onMounted(() => { auth.restore() })   // 刷新后用 /me 还原角色与 scopes

const shell = computed(() => route.meta.shell || 'portal')
const layout = computed(() => ({ portal: PortalLayout, earth: EarthLayout, blank: BlankLayout }[shell.value]))

// 壳 → <html data-shell>，CSS 令牌与 Element Plus 变量都挂在这个属性上
watchEffect(() => { document.documentElement.dataset.shell = shell.value })
</script>

<template>
  <component :is="layout">
    <router-view v-slot="{ Component }">
      <component :is="Component" />
    </router-view>
  </component>
</template>
