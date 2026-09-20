<script setup>
import { useRoute } from 'vue-router'
import { useUiStore } from '@/stores/ui'
const route = useRoute(); const ui = useUiStore()
</script>

<template>
  <div class="card" style="width:min(480px,92vw); text-align:center">
    <h1 style="margin:0 0 8px">{{ ui.t('forbidden.title') }}</h1>
    <p class="dim">需要权限：<span class="mono">{{ route.query.need || '—' }}</span></p>
    <p class="dim">当前账号的 scopes 不含该权限。公众账号可浏览公开资产；如需发布或调用算力，请在个人中心提交申请。</p>
    <RouterLink class="pill" :to="{ name: 'portal-home' }">{{ ui.t('forbidden.back') }}</RouterLink>
  </div>
</template>
