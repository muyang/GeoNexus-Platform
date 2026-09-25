<script setup>
/** 开放社区页：先套上统一页面骨架（标题 + 一句说明），内容沿用已有模块组件，
 *  待后续按参照站改造成各自的卡片/表格布局。 */
import PageShell from '@/components/PageShell.vue'
import View from '@/views/portal/OpenCommunity.vue'

const title = '开放社区'
const subtitle = '公告、指南与协作入口；把可复用的知识留在社区。'
</script>

<template>
  <PageShell :title="title" :subtitle="subtitle">
    <View />
  </PageShell>
</template>
