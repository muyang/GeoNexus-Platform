<script setup>
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { adminApi } from '@/api/admin'

/** 后台「方案」页签：目录（SDK 权威）+ 平台绑定（谁复用了哪个、什么状态）。
 *
 *  三件事在这里做：看目录、审绑定、派生。**没有"直接发布"**——发布走审批单，
 *  和 GeoCard 发布是同一条链路（见 lib/governance.js 的 recipe-publish）。 */

const bindings = ref([]); const catalogue = ref([])
const loading = ref(false); const error = ref(''); const sdk = ref({})
const pending = ref(0)

async function load() {
  loading.value = true; error.value = ''
  try {
    const data = await adminApi.recipes()
    bindings.value = data.bindings || []
    catalogue.value = data.catalogue || []
    pending.value = data.pendingApprovals || 0
    sdk.value = data.sdk || {}
  } catch (e) { error.value = e.message } finally { loading.value = false }
}

/** 派生：改命名空间/名字/参数，源方案一个字节都不动；派生件默认待审。 */
async function fork(row) {
  try {
    const { value } = await ElMessageBox.prompt('新的方案名（同一命名空间内唯一）', '派生方案', {
      inputValue: `${String(row.recipeId).split('/').pop().split('@')[0]}-copy`,
      confirmButtonText: '派生', cancelButtonText: '取消'
    })
    const res = await adminApi.forkRecipe({ recipe_id: row.recipeId, name: value })
    ElMessage.success(`已派生 ${res.forked.id}（待审：审批页签里裁决）`)
    await load()
  } catch (e) {
    if (e !== 'cancel') ElMessage.error(e.message)
  }
}

/** 绑定 → 案例详情（复用入口就是案例页）。 */
function openCase(caseId) { if (caseId) window.location.href = `/cases?caseId=${encodeURIComponent(caseId)}` }

const statusType = (s) => ({ approved: 'success', pending: 'warning', rejected: 'danger' }[s] || 'info')
const shortId = (id) => String(id || '').split('/').slice(-1)[0]
const reusable = computed(() => bindings.value.filter((b) => b.reusableParams?.length).length)

onMounted(load)
</script>

<template>
  <el-alert v-if="error" type="error" :title="error" :closable="false" style="margin-bottom:12px" />
  <div class="notice" style="margin-bottom:12px">
    目录权威在 <b>SDK 注册中心</b>（{{ sdk.registry || '—' }}，状态 {{ sdk.status || '—' }}）·
    已登记绑定 <b>{{ bindings.length }}</b> 条（其中 {{ reusable }} 条含可复用参数）·
    待审方案审批单 <b>{{ pending }}</b> 张
    <el-button size="small" style="margin-left:10px" @click="load">刷新</el-button>
  </div>

  <h3 style="margin:14px 0 8px">平台绑定：谁复用了哪个方案</h3>
  <el-table v-loading="loading" :data="bindings" border size="small">
    <el-table-column label="方案" min-width="240">
      <template #default="{ row }">
        <div class="mono">{{ row.recipeId }}</div>
        <div class="dim" v-if="row.parentRecipeId">派生自 {{ row.parentRecipeId }}</div>
      </template>
    </el-table-column>
    <el-table-column label="案例" min-width="150">
      <template #default="{ row }">
        <el-link v-if="row.caseId" type="primary" @click="openCase(row.caseId)">{{ row.caseId }}</el-link>
        <span v-else class="dim">未绑定案例</span>
      </template>
    </el-table-column>
    <el-table-column label="状态" width="110">
      <template #default="{ row }"><el-tag :type="statusType(row.status)" size="small">{{ row.status }}</el-tag></template>
    </el-table-column>
    <el-table-column label="步骤" width="70" prop="steps" />
    <el-table-column label="可改参数" min-width="150">
      <template #default="{ row }">
        <span class="mono">{{ (row.reusableParams || []).join(', ') || '—' }}</span>
        <div class="dim" v-if="row.fixedParams?.length">作者钉死：{{ row.fixedParams.join(', ') }}</div>
      </template>
    </el-table-column>
    <el-table-column label="交付物" min-width="150">
      <template #default="{ row }"><span class="mono">{{ (row.deliverables || []).join(', ') || '—' }}</span></template>
    </el-table-column>
    <el-table-column label="操作" width="120" fixed="right">
      <template #default="{ row }">
        <el-button size="small" @click="fork(row)">派生</el-button>
      </template>
    </el-table-column>
  </el-table>

  <h3 style="margin:18px 0 8px">SDK 目录：可复用的方案</h3>
  <el-table :data="catalogue" border size="small">
    <el-table-column label="地址" min-width="240">
      <template #default="{ row }"><span class="mono">{{ row.id }}</span></template>
    </el-table-column>
    <el-table-column label="名称" min-width="180" prop="name" />
    <el-table-column label="状态" width="100">
      <template #default="{ row }"><el-tag :type="statusType(row.status)" size="small">{{ row.status }}</el-tag></template>
    </el-table-column>
    <el-table-column label="步骤" width="70">
      <template #default="{ row }">{{ row.steps ?? '—' }}</template>
    </el-table-column>
    <el-table-column label="可改参数" min-width="150">
      <template #default="{ row }"><span class="mono">{{ (row.reusable_params || row.reusableParams || []).join(', ') || '—' }}</span></template>
    </el-table-column>
    <el-table-column label="交付物" min-width="150">
      <template #default="{ row }"><span class="mono">{{ (row.outputs || []).join(', ') || '—' }}</span></template>
    </el-table-column>
    <el-table-column label="绑定" width="90">
      <template #default="{ row }">
        <el-tag v-if="row.bound || bindings.some((b) => b.recipeId === row.id)" size="small" type="info">已复用</el-tag>
        <span v-else class="dim">—</span>
      </template>
    </el-table-column>
    <el-table-column label="操作" width="120" fixed="right">
      <template #default="{ row }">
        <el-button size="small" @click="fork(row)">派生</el-button>
      </template>
    </el-table-column>
  </el-table>
  <p class="dim" style="margin-top:10px">
    派生出来的方案默认是 <b>待审</b>：方案比卡片更该过审——卡片说"这是什么"，方案是"别人会照着跑什么"。
    审批在「审批」页签里裁决，通过后 SDK 侧才变为 approved。
  </p>
</template>
