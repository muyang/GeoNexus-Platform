<script setup>
import { useUiStore } from '@/stores/ui'
defineProps({ source: { type: String, default: '' }, degraded: Boolean, error: { type: String, default: '' } })
const ui = useUiStore()
</script>

<template>
  <p class="muted" style="margin:0">
    {{ ui.t('common.source') }}：<span class="mono">{{ source || '—' }}</span>
    <span v-if="degraded" class="pill warn" style="margin-left:6px">{{ ui.t('common.offlineSeed') }}</span>
    <span v-if="error" class="pill bad" style="margin-left:6px">{{ error }}</span>
  </p>
</template>
