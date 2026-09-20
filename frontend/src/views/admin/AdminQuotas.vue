<script setup>
import { onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { adminApi } from '@/api/admin'

const items = ref([]); const loading = ref(false); const error = ref('')
const form = ref({ scope: 'dept', subject: '', limit: 100, unit: 'core-hour' })

async function load() {
  loading.value = true; error.value = ''
  try { items.value = (await adminApi.quotas()).items } catch (e) { error.value = e.message } finally { loading.value = false }
}
async function save() {
  if (!form.value.subject) return ElMessage.warning('请填写主体（部门或用户）')
  try { await adminApi.setQuota(form.value); ElMessage.success('已保存'); form.value.subject = ''; await load() }
  catch (e) { ElMessage.error(e.message) }
}
onMounted(load)
</script>

<template>
  <el-alert v-if="error" type="error" :title="error" :closable="false" style="margin-bottom:12px" />
  <el-form inline style="margin-bottom:12px">
    <el-form-item label="层级">
      <el-select v-model="form.scope" style="width:110px">
        <el-option value="dept" label="部门" /><el-option value="user" label="用户" />
      </el-select>
    </el-form-item>
    <el-form-item label="主体"><el-input v-model="form.subject" placeholder="dept-a 或 user@example.com" style="width:230px" /></el-form-item>
    <el-form-item label="额度"><el-input-number v-model="form.limit" :min="0" /></el-form-item>
    <el-form-item label="单位">
      <el-select v-model="form.unit" style="width:130px">
        <el-option value="core-hour" label="核时" /><el-option value="GB-day" label="GB·天" /><el-option value="task" label="任务数" />
      </el-select>
    </el-form-item>
    <el-button type="primary" @click="save">设置配额</el-button>
    <el-button @click="load">刷新</el-button>
  </el-form>

  <el-table v-loading="loading" :data="items" border size="small">
    <el-table-column prop="scope" label="层级" width="90" />
    <el-table-column prop="subject" label="主体" min-width="200" />
    <el-table-column prop="limit" label="额度" width="100" />
    <el-table-column prop="used" label="已用" width="100" />
    <el-table-column prop="remaining" label="剩余" width="100" />
    <el-table-column prop="unit" label="单位" width="110" />
    <el-table-column label="占用"><template #default="{ row }">
      <el-progress :percentage="row.limit ? Math.min(100, Math.round(row.used / row.limit * 100)) : 0" :stroke-width="10" />
    </template></el-table-column>
  </el-table>
  <p class="dim" style="margin-top:10px">扣减时部门与个人两级取小者生效；不足会返回 409，不产生部分消耗。</p>
</template>
