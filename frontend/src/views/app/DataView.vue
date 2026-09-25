<script setup>
/** 数据资源页：先套上统一页面骨架（标题 + 一句说明），内容沿用已有模块组件，
 *  待后续按参照站改造成各自的卡片/表格布局。 */
import PageShell from '@/components/PageShell.vue'
import View from '@/views/portal/DataResources.vue'

const title = '数据资源'
const subtitle = '发现可用于地图展示与分析的数据，并清楚了解数据归属。'
</script>

<template>
  <PageShell :title="title" :subtitle="subtitle">
    <View />
  </PageShell>
</template>
