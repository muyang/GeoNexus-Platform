<script setup>
/** 算力平台页：先套上统一页面骨架（标题 + 一句说明），内容沿用已有模块组件，
 *  待后续按参照站改造成各自的卡片/表格布局。 */
import PageShell from '@/components/PageShell.vue'
import View from '@/views/portal/ComputePlatform.vue'

const title = '算力平台'
const subtitle = '分布在各节点的算力与运行环境，含资源预约与占用。'
</script>

<template>
  <PageShell :title="title" :subtitle="subtitle">
    <View />
  </PageShell>
</template>
