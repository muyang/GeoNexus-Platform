<script setup>
import { onMounted, ref } from 'vue'
import { adminApi } from '@/api/admin'

const items = ref([]); const loading = ref(false); const error = ref('')
async function load() {
  loading.value = true; error.value = ''
  try { items.value = (await adminApi.audit(200)).items } catch (e) { error.value = e.message } finally { loading.value = false }
}
onMounted(load)
</script>

<template>
  <el-alert v-if="error" type="error" :title="error" :closable="false" style="margin-bottom:12px" />
  <el-button size="small" style="margin-bottom:10px" @click="load">刷新</el-button>
  <el-table v-loading="loading" :data="items" border size="small" max-height="520">
    <el-table-column prop="at" label="时间" width="190" />
    <el-table-column prop="action" label="动作" width="170" />
    <el-table-column prop="actorEmail" label="操作者" width="190" />
    <el-table-column prop="subject" label="对象" width="160" show-overflow-tooltip />
    <el-table-column prop="result" label="结果" width="80" />
    <el-table-column prop="detail" label="明细" min-width="200" show-overflow-tooltip />
  </el-table>
  <p class="dim" style="margin-top:10px">审计只追加：谁、何时、对什么、结果如何。跨系统执行另由 SDK/节点侧记录，用 request_id 关联。</p>
</template>
