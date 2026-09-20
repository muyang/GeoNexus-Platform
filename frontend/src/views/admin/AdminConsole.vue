<script setup>
import { ref } from 'vue'
import { useRoute } from 'vue-router'
import { useUiStore } from '@/stores/ui'
import { useAuthStore } from '@/stores/auth'
import AdminOverview from './AdminOverview.vue'
import AdminModules from './AdminModules.vue'
import AdminApprovals from './AdminApprovals.vue'
import AdminQuotas from './AdminQuotas.vue'
import AdminAudit from './AdminAudit.vue'

const ui = useUiStore(); const auth = useAuthStore()
const route = useRoute()
const tab = ref(String(route.query.tab || 'overview'))   // 支持 /admin?tab=modules 深链
const tabs = [
  { id: 'overview', label: '总览' },
  { id: 'modules', label: '九大模块内容' },
  { id: 'approvals', label: '审批' },
  { id: 'quotas', label: '配额' },
  { id: 'audit', label: '审计' }
]
</script>

<template>
  <div class="page-head">
    <h1>{{ ui.t('nav.admin') }}</h1>
    <p>账号/组织/角色/菜单为 RuoYi 原生模块；资源、服务、开发、审批、配额与<b>九大模块内容</b>为扩展菜单。</p>
  </div>

  <div class="notice" style="margin-bottom:14px">
    当前账号：<span class="mono">{{ auth.user?.email || '—' }}</span> ·
    角色 <span class="mono">{{ auth.roles.join(' · ') || '—' }}</span> ·
    scopes <span class="mono">{{ auth.scopes.join(' · ') || '—' }}</span>
    <span v-if="auth.user?.offline"> · <b>离线演示身份</b>（后端不可达，管理接口会 401）</span>
  </div>

  <el-tabs v-model="tab">
    <el-tab-pane v-for="t in tabs" :key="t.id" :label="t.label" :name="t.id" lazy>
      <AdminOverview v-if="t.id === 'overview'" />
      <AdminModules v-else-if="t.id === 'modules'" />
      <AdminApprovals v-else-if="t.id === 'approvals'" />
      <AdminQuotas v-else-if="t.id === 'quotas'" />
      <AdminAudit v-else />
    </el-tab-pane>
  </el-tabs>
</template>
