<script setup>
import { onMounted, ref } from 'vue'
import { adminApi } from '@/api/admin'

const data = ref(null); const error = ref(''); const loading = ref(true)

async function load() {
  loading.value = true; error.value = ''
  try { data.value = await adminApi.overview() } catch (e) { error.value = e.message } finally { loading.value = false }
}
onMounted(load)
</script>

<template>
  <div v-loading="loading">
    <el-alert v-if="error" type="error" :title="error" :closable="false" style="margin-bottom:12px" />
    <div v-if="data" class="card-grid">
      <div class="card"><h3>账号 / 会话</h3><p class="kpi">{{ data.users }}</p><p>活跃会话 {{ data.sessions }}</p></div>
      <div class="card"><h3>案例库</h3><p class="kpi">{{ data.cases }}</p><p>已发布 {{ data.casesPublished }}</p></div>
      <div class="card"><h3>待审批</h3><p class="kpi">{{ data.approvalsPending }}</p><p>累计 {{ data.approvalsTotal }}</p></div>
      <div class="card"><h3>模块内容条目</h3><p class="kpi">{{ data.moduleItems }}</p><p>覆盖 {{ data.modules.length }} 个模块</p></div>
      <div class="card"><h3>配额项</h3><p class="kpi">{{ data.quotas }}</p><p>部门 / 用户两级</p></div>
      <div class="card"><h3>审计事件</h3><p class="kpi">{{ data.auditEvents }}</p><p>只追加，不可改</p></div>
      <div class="card">
        <h3>SDK Registry</h3>
        <p class="kpi" :style="data.sdk.status === 'up' ? '' : 'color:#dc2626'">{{ data.sdk.status }}</p>
        <p class="mono" style="font-size:12px">{{ data.sdk.registry }}</p>
        <p v-if="data.sdk.error" style="color:#b91c1c; font-size:12px">{{ data.sdk.error }}</p>
        <p v-else>在册卡片 {{ data.sdk.cards }}</p>
      </div>
    </div>
    <el-button style="margin-top:12px" @click="load">刷新</el-button>
  </div>
</template>
