<script setup>
/** 算子模型页：先套上统一页面骨架（标题 + 一句说明），内容沿用已有模块组件，
 *  待后续按参照站改造成各自的卡片/表格布局。 */
import PageShell from '@/components/PageShell.vue'
import View from '@/views/portal/OperatorModels.vue'

const title = '算子模型'
const subtitle = '可复用的算子、模型与技能清单，含输入输出契约。'
</script>

<template>
  <PageShell :title="title" :subtitle="subtitle">
    <View />
  </PageShell>
</template>
