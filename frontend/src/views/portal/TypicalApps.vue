<script setup>
import { useUiStore } from '@/stores/ui'
const ui = useUiStore()
const apps = [
  { t: '可持续发展与评估', d: 'SDG 指标监测：土地覆盖、水体、植被与人口暴露', ref: 'SDG' },
  { t: '卫星对地观测', d: '轨道可视化、影像检索与订单、变化检测', ref: 'Satellite' },
  { t: '灾害风险减量', d: '洪涝范围提取、道路损毁与人口暴露评估', ref: 'Disaster' },
  { t: '气候变化管理', d: '长时序遥感与碳排放空间化估算', ref: 'Climate' },
  { t: '地理信息知识与培训', d: '知识图谱检索、案例教学与技能认证', ref: 'Knowledge' },
  { t: '全球资源查询', d: '跨节点数据与算子发现，数据不动计算移动', ref: 'Federation' }
]
</script>

<template>
  <div class="page-head">
    <h1>{{ ui.t('portal.typicalApps') }}</h1>
    <p>典型应用由门户的「超级智能体」与「莫干地球系统」共同支撑：前台是应用，底层是同一套协议与资产。</p>
  </div>
  <div class="card-grid">
    <article v-for="a in apps" :key="a.t" class="card">
      <h3>{{ a.t }}</h3><p>{{ a.d }}</p>
      <p style="margin-top:8px"><span class="tag">{{ a.ref }}</span></p>
    </article>
  </div>
</template>
