<script setup>
import { onMounted, ref } from 'vue'
import { useUiStore } from '@/stores/ui'
import { useAuthStore } from '@/stores/auth'
import { cardApi, caseApi } from '@/api'

const ui = useUiStore(); const auth = useAuthStore()
const kpi = ref({ cards: 0, cases: 0 })
const modules = [
  { name: 'visual-earth', key: 'portal.visualEarth', desc: '以地图为中心浏览全球数据与知识图层' },
  { name: 'global-cases', key: 'portal.globalCases', desc: '可复现的真实分析案例与联邦实例' },
  { name: 'data-resources', key: 'portal.dataResources', desc: '数据目录：一数据集一卡，含溯源与许可' },
  { name: 'operator-models', key: 'portal.operatorModels', desc: '算子与模型：GeoSkill / AI 模型登记' },
  { name: 'compute-platform', key: 'portal.computePlatform', desc: '算力节点、队列与占用观测' },
  { name: 'open-community', key: 'portal.openCommunity', desc: '开放社区：贡献数据、算子与案例' },
  { name: 'super-agent', key: 'portal.superAgent', desc: '用一句话描述目标，自动规划与执行' },
  { name: 'typical-apps', key: 'portal.typicalApps', desc: '典型应用：可持续发展、灾害、气候变化' }
]

onMounted(async () => {
  const [c, s] = await Promise.all([cardApi.list(), caseApi.list()])
  kpi.value = { cards: c.rows.length, cases: s.rows.length }
})
</script>

<template>
  <section class="hero">
    <h1>{{ ui.t('app.title') }}</h1>
    <p>{{ ui.t('app.subtitle') }} · 门户面向公众与机构：浏览开放数据与案例，注册后可提交资产与算力申请。</p>
    <p v-if="!auth.loggedIn" class="notice" style="margin-top:12px">
      当前未登录 —— <RouterLink :to="{ name: 'register' }">注册公众账号</RouterLink> 或
      <RouterLink :to="{ name: 'login' }">登录</RouterLink>；机构用户由管理员开户。
    </p>
  </section>

  <div class="card-grid" style="margin-bottom:18px">
    <div class="card"><h3>数据资产</h3><p class="kpi">{{ kpi.cards }}</p><p>张 GeoCard 在册</p></div>
    <div class="card"><h3>可复现案例</h3><p class="kpi">{{ kpi.cases }}</p><p>个案例可一键复跑</p></div>
    <div class="card"><h3>算力入口</h3><p class="kpi">OGE</p><p>默认资源节点，未来接入其他 GeoNode</p></div>
  </div>

  <h2 style="font-size:16px; margin:0 0 10px">门户模块</h2>
  <div class="card-grid">
    <RouterLink v-for="m in modules" :key="m.name" class="card" :to="{ name: m.name }"
                style="text-decoration:none; color:inherit">
      <h3>{{ ui.t(m.key) }}</h3>
      <p>{{ m.desc }}</p>
    </RouterLink>
  </div>
</template>
