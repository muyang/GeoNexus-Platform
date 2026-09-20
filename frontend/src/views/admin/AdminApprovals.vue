<script setup>
import { onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { adminApi } from '@/api/admin'

const items = ref([]); const status = ref('pending'); const loading = ref(false); const error = ref('')

async function load() {
  loading.value = true; error.value = ''
  try { items.value = (await adminApi.approvals(status.value || undefined)).items } catch (e) { error.value = e.message } finally { loading.value = false }
}
async function decide(row, decision) {
  try {
    const { value } = await ElMessageBox.prompt(
      decision === 'approve' ? '通过意见（可选）' : '驳回理由', decision === 'approve' ? '通过' : '驳回',
      { inputType: 'textarea', inputValue: '', confirmButtonText: '确认', cancelButtonText: '取消' })
    await adminApi.decide(row.id, decision, value)
    ElMessage.success(decision === 'approve' ? '已通过并同步 SDK' : '已驳回并同步 SDK')
    await load()
  } catch (e) { if (e !== 'cancel') ElMessage.error(e.message) }
}
onMounted(load)
</script>

<template>
  <el-alert v-if="error" type="error" :title="error" :closable="false" style="margin-bottom:12px" />
  <el-radio-group v-model="status" style="margin-bottom:12px" @change="load">
    <el-radio-button value="pending">待审</el-radio-button>
    <el-radio-button value="approved">已通过</el-radio-button>
    <el-radio-button value="rejected">已驳回</el-radio-button>
    <el-radio-button value="">全部</el-radio-button>
  </el-radio-group>

  <el-table v-loading="loading" :data="items" border size="small">
    <el-table-column prop="kind" label="类型" width="150" />
    <el-table-column prop="subjectId" label="对象" min-width="150" />
    <el-table-column prop="title" label="标题" min-width="170" show-overflow-tooltip />
    <el-table-column label="状态" width="100">
      <template #default="{ row }">
        <el-tag size="small" :type="row.status === 'approved' ? 'success' : row.status === 'rejected' ? 'danger' : 'warning'">{{ row.status }}</el-tag>
      </template>
    </el-table-column>
    <el-table-column label="SDK" width="110">
      <template #default="{ row }"><span class="mono" style="font-size:12px">{{ row.sdkState || '—' }}</span></template>
    </el-table-column>
    <el-table-column prop="submittedByEmail" label="提交人" width="170" />
    <el-table-column label="操作" width="160">
      <template #default="{ row }">
        <template v-if="row.status === 'pending'">
          <el-button link type="success" @click="decide(row, 'approve')">通过</el-button>
          <el-button link type="danger" @click="decide(row, 'reject')">驳回</el-button>
        </template>
        <span v-else class="dim">—</span>
      </template>
    </el-table-column>
  </el-table>
  <p class="dim" style="margin-top:10px">
    通过/驳回会把决定**转发给 SDK Registry**，资产最终状态以 SDK 为准；本页只是镜像单据与审计入口。
  </p>
</template>
