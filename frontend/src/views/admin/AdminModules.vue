<script setup>
import { onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { adminApi } from '@/api/admin'

/** 九大模块的内容管理：门户的每个模块在这里都有对应的条目集合，
 *  前台按 visible 与 sortOrder 渲染 —— 后台改的内容真的会出现在门户上。 */
const MODULE_LABELS = {
  'portal-home': '门户首页', 'visual-earth': '可视化地球', 'global-cases': '全球案例',
  'data-resources': '数据资源', 'operator-models': '算子模型', 'compute-platform': '算力平台',
  'open-community': '开放社区', 'super-agent': '超级智能体', 'typical-apps': '典型应用'
}
const modules = ref([]); const current = ref('portal-home')
const items = ref([]); const loading = ref(false); const error = ref('')
const dialog = ref(false); const editing = ref(null)
const form = ref({ title: '', summary: '', tag: '', link: '', sortOrder: 0, visible: true })

async function loadModules() {
  try { modules.value = (await adminApi.modules()).modules } catch (e) { error.value = e.message }
}
async function loadItems() {
  loading.value = true; error.value = ''
  try { items.value = (await adminApi.moduleItems(current.value)).items } catch (e) { error.value = e.message } finally { loading.value = false }
}
function openCreate() {
  editing.value = null
  form.value = { title: '', summary: '', tag: '', link: '', sortOrder: items.value.length, visible: true }
  dialog.value = true
}
function openEdit(row) {
  editing.value = row
  form.value = { title: row.title, summary: row.summary || '', tag: row.tag || '', link: row.link || '', sortOrder: row.sortOrder, visible: row.visible }
  dialog.value = true
}
async function save() {
  if (!form.value.title) return ElMessage.warning('标题必填')
  try {
    if (editing.value) await adminApi.updateItem(current.value, editing.value.id, form.value)
    else await adminApi.createItem(current.value, form.value)
    dialog.value = false; ElMessage.success('已保存'); await Promise.all([loadItems(), loadModules()])
  } catch (e) { ElMessage.error(e.message) }
}
async function remove(row) {
  try {
    await ElMessageBox.confirm(`删除「${row.title}」？`, '确认', { type: 'warning' })
    await adminApi.deleteItem(current.value, row.id); ElMessage.success('已删除'); await Promise.all([loadItems(), loadModules()])
  } catch (e) { if (e !== 'cancel') ElMessage.error(e.message) }
}
onMounted(async () => { await loadModules(); await loadItems() })
</script>

<template>
  <el-alert v-if="error" type="error" :title="error" :closable="false" style="margin-bottom:12px" />
  <el-radio-group v-model="current" style="margin-bottom:12px" @change="loadItems">
    <el-radio-button v-for="m in modules" :key="m.module" :value="m.module">
      {{ MODULE_LABELS[m.module] || m.module }} ({{ m.visible }})
    </el-radio-button>
  </el-radio-group>

  <div style="margin-bottom:10px">
    <el-button type="primary" @click="openCreate">新增条目</el-button>
    <el-button @click="loadItems">刷新</el-button>
  </div>

  <el-table v-loading="loading" :data="items" border size="small">
    <el-table-column prop="sortOrder" label="排序" width="70" />
    <el-table-column prop="title" label="标题" min-width="180" />
    <el-table-column prop="summary" label="摘要" min-width="220" show-overflow-tooltip />
    <el-table-column prop="tag" label="标签" width="110" />
    <el-table-column label="可见" width="80">
      <template #default="{ row }"><el-tag :type="row.visible ? 'success' : 'info'" size="small">{{ row.visible ? '是' : '否' }}</el-tag></template>
    </el-table-column>
    <el-table-column label="操作" width="150">
      <template #default="{ row }">
        <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
        <el-button link type="danger" @click="remove(row)">删除</el-button>
      </template>
    </el-table-column>
  </el-table>

  <el-dialog v-model="dialog" :title="editing ? '编辑条目' : '新增条目'" width="520">
    <el-form label-width="72px">
      <el-form-item label="标题"><el-input v-model="form.title" /></el-form-item>
      <el-form-item label="摘要"><el-input v-model="form.summary" type="textarea" :rows="2" /></el-form-item>
      <el-form-item label="标签"><el-input v-model="form.tag" placeholder="如 SDG15 / 灾害" /></el-form-item>
      <el-form-item label="链接"><el-input v-model="form.link" placeholder="可指向案例或外部资源" /></el-form-item>
      <el-form-item label="排序"><el-input-number v-model="form.sortOrder" :min="0" /></el-form-item>
      <el-form-item label="可见"><el-switch v-model="form.visible" /></el-form-item>
    </el-form>
    <template #footer><el-button @click="dialog = false">取消</el-button><el-button type="primary" @click="save">保存</el-button></template>
  </el-dialog>
</template>
