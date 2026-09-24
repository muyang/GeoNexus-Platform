<script setup>
import { computed, onMounted, ref } from 'vue'
import { adminApi } from '@/api/admin'

/** 后台「交付物」页签：每次运行的结论清单。
 *
 *  交付物不是"运行产生的所有文件"，而是方案 `outputs` 里**声明**的那几项结论
 *  （见 SDK 的 docs/RECIPE.md）。中间产物留在运行记录里，不在这里冒充交付。
 *  这里只读：产物能不能下载、给谁下载，由案例的可见性决定。 */

const items = ref([]); const loading = ref(false); const error = ref('')
const stats = ref({ byRole: {}, runs: 0, cases: 0 })
const role = ref('')

async function load() {
  loading.value = true; error.value = ''
  try {
    const data = await adminApi.deliverables({ role: role.value || undefined })
    items.value = data.items || []
    stats.value = { byRole: data.byRole || {}, runs: data.runs || 0, cases: data.cases || 0 }
  } catch (e) { error.value = e.message } finally { loading.value = false }
}

const roleLabel = { data: '数据', knowledge: '知识', model: '模型', skill: '算子', workflow: '方案', agent: '智能体', compute: '算力' }
const sum = (list) => list.reduce((n, d) => n + (d.sizeBytes || 0), 0)
const human = (bytes) => (bytes ? `${(bytes / 1024).toFixed(1)} KB` : '—')
const withArtifact = computed(() => items.value.filter((d) => d.hasArtifact).length)

/** 报告在线看（受控读取：需要登录，且路径要在白名单里）。 */
function openReport(id) { window.open(`/api/deliverables/${encodeURIComponent(id)}/report`, '_blank') }

onMounted(load)
</script>

<template>
  <el-alert v-if="error" type="error" :title="error" :closable="false" style="margin-bottom:12px" />
  <div class="notice" style="margin-bottom:12px">
    交付物 <b>{{ items.length }}</b> 条（有实体产物 {{ withArtifact }} 条，合计 {{ human(sum(items)) }}）·
    涉及案例 <b>{{ stats.cases }}</b> 个 · 运行记录 <b>{{ stats.runs }}</b> 条
    <el-select v-model="role" size="small" style="width:140px;margin-left:10px" clearable placeholder="全部角色" @change="load">
      <el-option v-for="(label, key) in roleLabel" :key="key" :value="key" :label="label" />
    </el-select>
    <el-button size="small" @click="load">刷新</el-button>
  </div>

  <el-table v-loading="loading" :data="items" border size="small">
    <el-table-column label="交付物" min-width="180">
      <template #default="{ row }">
        <div>{{ row.name }}</div>
        <div class="dim mono">{{ row.ref || '—' }} · 步骤 {{ row.stepId || '—' }}</div>
      </template>
    </el-table-column>
    <el-table-column label="角色" width="100">
      <template #default="{ row }"><el-tag size="small" :type="row.role === 'knowledge' ? 'success' : 'info'">{{ roleLabel[row.role] || row.role }}</el-tag></template>
    </el-table-column>
    <el-table-column label="案例" min-width="150">
      <template #default="{ row }">
        <el-link v-if="row.caseId" type="primary" :href="`/cases?caseId=${encodeURIComponent(row.caseId)}`">{{ row.caseId }}</el-link>
        <span v-else class="dim">—</span>
      </template>
    </el-table-column>
    <el-table-column label="运行" min-width="130">
      <template #default="{ row }"><span class="mono">{{ row.runId }}</span></template>
    </el-table-column>
    <el-table-column label="媒体类型" width="150" prop="mediaType" />
    <el-table-column label="大小" width="90">
      <template #default="{ row }">{{ human(row.sizeBytes) }}</template>
    </el-table-column>
    <el-table-column label="状态" width="110">
      <template #default="{ row }">
        <el-tag size="small" :type="row.status === 'ready' ? 'success' : 'warning'">{{ row.status }}</el-tag>
      </template>
    </el-table-column>
    <el-table-column label="操作" width="110" fixed="right">
      <template #default="{ row }">
        <el-button v-if="row.hasArtifact" size="small" type="primary" link @click="openReport(row.id)">查看</el-button>
        <span v-else class="dim">无产物</span>
      </template>
    </el-table-column>
  </el-table>
  <p class="dim" style="margin-top:10px">
    路径不出现在这里（也不出现在公开接口里）：产物落在哪是运行环境的实现细节。
    下载是<b>受控读取</b>——需要登录，且路径必须在 <span class="mono">ARTIFACT_ROOTS</span> 白名单内。
  </p>
</template>
