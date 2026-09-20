<script setup>
import { useUiStore } from '@/stores/ui'
import { useAuthStore } from '@/stores/auth'
const ui = useUiStore(); const auth = useAuthStore()
const steps = [
  { t: '注册公众账号', d: '邮箱注册即可浏览公开数据与案例；发布与算力需审批。' },
  { t: '认领或贡献数据', d: '提交数据集并生成 GeoCard（含许可与溯源），经审批后进入目录。' },
  { t: '贡献算子 / 案例', d: '按 GeoSkill 规范提交算子；把分析过程写成可复现案例。' },
  { t: '参与评审', d: '对社区资产做质量与合规评审，评审记录进入审计。' }
]
</script>

<template>
  <div class="page-head">
    <h1>{{ ui.t('portal.openCommunity') }}</h1>
    <p>开放社区面向公众与机构：贡献数据、算子与案例，形成可复用的地理信息公共产品。</p>
  </div>
  <div class="card-grid">
    <div v-for="(s, i) in steps" :key="s.t" class="card">
      <h3>{{ i + 1 }}. {{ s.t }}</h3><p>{{ s.d }}</p>
    </div>
  </div>
  <div class="notice" style="margin-top:14px">
    <template v-if="auth.loggedIn">当前已登录（{{ auth.displayName }}）—— 可在<span class="mono">个人中心 → 我的资产</span>查看归属你的资产。</template>
    <template v-else><RouterLink :to="{ name: 'register' }">注册公众账号</RouterLink> 后即可开始贡献。</template>
  </div>
</template>
