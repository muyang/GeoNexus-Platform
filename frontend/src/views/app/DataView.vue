<script setup>
/** 数据资源模块（对齐参照站 ref-03）：带计数的筛选页签 + 工具栏 + 卡片栅格。
 *
 *  参照站的要点：① 页签带计数，用户先知道"总共有多少、各类多少"；
 *  ② 工具栏一行放搜索、几个下拉与视图切换；③ 一行汇总里**诚实说明缺什么**
 *  （它写的是"无法按更新时间排序：目录未记录各资产的更新时间"）；④ 卡片有类型标签、
 *  预览区、标题、描述、三个字段与页脚。这几条这里都照做。
 */
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import PageShell from '@/components/PageShell.vue'
import SourceTag from '@/components/SourceTag.vue'
import { cardApi } from '@/api'

const router = useRouter()
const rows = ref([]); const source = ref(''); const degraded = ref(false); const error = ref('')
const kind = ref('all'); const q = ref(''); const owner = ref('all'); const visibility = ref('all')
const sort = ref('name'); const view = ref('grid')

/** 类型词表：用 GeoCard 自己的角色词表，不另造一套分类。 */
const KINDS = [
  { key: 'all', label: '全部' },
  { key: 'data', label: '数据' },
  { key: 'model', label: '模型' },
  { key: 'skill', label: '算子' },
  { key: 'knowledge', label: '知识' },
  { key: 'compute', label: '算力' }
]
const kindLabel = (k) => (KINDS.find((x) => x.key === k) || { label: k }).label

const counts = computed(() => {
  const out = { all: rows.value.length }
  for (const r of rows.value) out[r.type || 'data'] = (out[r.type || 'data'] || 0) + 1
  return out
})
const owners = computed(() => [...new Set(rows.value.map((r) => r.owner || r.provider).filter(Boolean))].sort())
const visibilities = computed(() => [...new Set(rows.value.map((r) => r.visibility || 'public'))].sort())

const visible = computed(() => {
  const needle = q.value.trim().toLowerCase()
  let list = rows.value.filter((r) => {
    if (kind.value !== 'all' && (r.type || 'data') !== kind.value) return false
    if (owner.value !== 'all' && (r.owner || r.provider) !== owner.value) return false
    if (visibility.value !== 'all' && (r.visibility || 'public') !== visibility.value) return false
    if (!needle) return true
    return [r.title, r.description, r.id, r.provider, ...(r.tags || [])]
      .filter(Boolean).join(' ').toLowerCase().includes(needle)
  })
  list = [...list]
  if (sort.value === 'name') list.sort((a, b) => String(a.title || a.id).localeCompare(String(b.title || b.id)))
  if (sort.value === 'owner') list.sort((a, b) => String(a.owner || '').localeCompare(String(b.owner || '')))
  return list
})

const bboxText = (b) => (Array.isArray(b) && b.length === 4 ? b.map((n) => Number(n).toFixed(1)).join(', ') : '未登记')
const temporalText = (t) => (t && (t.start || t.end) ? `${t.start || '—'} → ${t.end || '—'}` : '未登记')

/** 卡片的下一步：有范围的去地图看，算子/模型去工作台。 */
function openCard(card) {
  if (Array.isArray(card.bbox) && card.bbox.length === 4) {
    router.push({ name: 'map', query: { card: card.id } })
    return
  }
  if ((card.type || 'data') === 'skill' || card.type === 'model') {
    router.push({ name: 'workbench' })
  }
}

onMounted(async () => {
  const r = await cardApi.list()
  rows.value = r.rows; source.value = r.source; degraded.value = r.degraded; error.value = r.error || ''
})
</script>

<template>
  <PageShell title="数据资源" subtitle="发现可用于地图展示与分析的数据、模型与算子，并清楚了解数据归属。">
    <template #actions>
      <SourceTag :source="source" :degraded="degraded" :error="error" />
    </template>

    <!-- 带计数的筛选页签 -->
    <div class="tabs">
      <button v-for="k in KINDS" :key="k.key" class="tab" :class="{ on: kind === k.key }" type="button"
              @click="kind = k.key">
        {{ k.label }}<span class="tab-count">{{ counts[k.key] || 0 }}</span>
      </button>
    </div>

    <!-- 工具栏 -->
    <div class="toolbar">
      <input v-model="q" class="search" type="search" placeholder="搜索数据名称、描述或标签" />
      <select v-model="owner" class="select">
        <option value="all">全部权属方</option>
        <option v-for="o in owners" :key="o" :value="o">{{ o }}</option>
      </select>
      <select v-model="visibility" class="select">
        <option value="all">全部可见性</option>
        <option v-for="v in visibilities" :key="v" :value="v">{{ v }}</option>
      </select>
      <select v-model="sort" class="select">
        <option value="name">名称</option>
        <option value="owner">权属方</option>
      </select>
      <div class="view-toggle">
        <button class="icon-btn" :class="{ on: view === 'grid' }" type="button" @click="view = 'grid'">▦</button>
        <button class="icon-btn" :class="{ on: view === 'list' }" type="button" @click="view = 'list'">☰</button>
      </div>
    </div>

    <p class="summary">
      共 {{ visible.length }} 项{{ kind === 'all' ? '' : kindLabel(kind) }}资源 ·
      目录未记录各资产的更新时间，因此无法按更新时间排序。
    </p>

    <!-- 卡片栅格 -->
    <div class="cards" :class="view === 'list' ? 'cards-list' : ''">
      <article v-for="c in visible" :key="c.id" class="card">
        <div class="card-preview">
          <span class="dim">暂无预览</span>
          <em class="card-type">{{ kindLabel(c.type || 'data') }}</em>
        </div>
        <h3 class="card-title">{{ c.title || c.id }}</h3>
        <p class="card-desc">{{ c.description || '该资产未提供描述。' }}</p>
        <dl class="card-fields">
          <div><dt>覆盖范围</dt><dd class="mono">{{ bboxText(c.bbox) }}</dd></div>
          <div><dt>时间</dt><dd class="mono">{{ temporalText(c.temporal) }}</dd></div>
          <div><dt>权属方</dt><dd>{{ c.provider || c.owner || '未提供' }}</dd></div>
        </dl>
        <footer class="card-foot">
          <em class="tag" :class="(c.visibility || 'public') === 'public' ? 'tag-ok' : 'tag-warn'">
            {{ c.visibility || 'public' }}
          </em>
          <span class="dim mono">{{ c.id }}</span>
          <button class="link-btn" type="button" @click="openCard(c)">
            {{ Array.isArray(c.bbox) && c.bbox.length === 4 ? '在地图上看 ↗' : '查看详情' }}
          </button>
        </footer>
      </article>
      <p v-if="!visible.length" class="empty">没有匹配的资源。清空搜索词或切换页签试试。</p>
    </div>
  </PageShell>
</template>

<style scoped>
.tabs { display: flex; gap: 6px; border-bottom: 1px solid var(--e-line, rgba(255,255,255,.08)); margin-bottom: 14px; }
.tab { position: relative; height: 34px; padding: 0 12px; border: 0; background: transparent; color: inherit;
  font: inherit; font-size: 13.5px; cursor: pointer; opacity: .7; border-bottom: 2px solid transparent; }
.tab.on { opacity: 1; font-weight: 600; border-bottom-color: var(--e-cyan, #57d7ff); }
.tab-count { margin-left: 6px; font-size: 11.5px; opacity: .7; }

.toolbar { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.search, .select { height: 32px; padding: 0 10px; border-radius: 8px; color: inherit; font: inherit; font-size: 13px;
  border: 1px solid var(--e-line, rgba(255,255,255,.12)); background: rgba(255,255,255,.03); }
.search { flex: 1; min-width: 220px; }
.view-toggle { margin-left: auto; display: flex; gap: 4px; }
.icon-btn { width: 30px; height: 32px; border-radius: 8px; cursor: pointer; color: inherit;
  border: 1px solid var(--e-line, rgba(255,255,255,.12)); background: transparent; }
.icon-btn.on { border-color: var(--e-cyan, #57d7ff); background: rgba(87,215,255,.1); }

.summary { margin: 12px 0 14px; font-size: 12.5px; opacity: .7; }

.cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(268px, 1fr)); gap: 14px; }
.cards-list { grid-template-columns: 1fr; }
.card { display: flex; flex-direction: column; border: 1px solid var(--e-line, rgba(255,255,255,.08));
  border-radius: 12px; background: rgba(255,255,255,.02); overflow: hidden; }
.card-preview { position: relative; height: 118px; display: flex; align-items: center; justify-content: center;
  background: repeating-linear-gradient(135deg, rgba(255,255,255,.03) 0 8px, transparent 8px 16px);
  border-bottom: 1px solid var(--e-line, rgba(255,255,255,.06)); }
.card-type { position: absolute; top: 8px; left: 8px; font-style: normal; font-size: 11px; padding: 1px 7px;
  border-radius: 999px; border: 1px solid var(--e-line, rgba(255,255,255,.14)); }
.card-title { margin: 12px 13px 4px; font-size: 14px; line-height: 1.45; }
.card-desc { margin: 0 13px; font-size: 12.5px; line-height: 1.65; opacity: .75; min-height: 40px; }
.card-fields { margin: 10px 13px 0; display: flex; flex-direction: column; gap: 4px; font-size: 12px; }
.card-fields div { display: flex; gap: 8px; }
.card-fields dt { flex: none; width: 62px; opacity: .6; margin: 0; }
.card-fields dd { margin: 0; opacity: .9; }
.card-foot { display: flex; align-items: center; gap: 8px; margin-top: auto; padding: 10px 13px;
  border-top: 1px solid var(--e-line, rgba(255,255,255,.06)); font-size: 11.5px; }
.link-btn { margin-left: auto; background: transparent; border: 0; color: inherit; font: inherit; font-size: 12px;
  cursor: pointer; opacity: .85; border-bottom: 1px dashed currentColor; }

.tag { font-style: normal; font-size: 11px; padding: 1px 7px; border-radius: 999px;
  border: 1px solid var(--e-line, rgba(255,255,255,.14)); }
.tag-ok { border-color: rgba(60,230,176,.5); }
.tag-warn { border-color: rgba(255,196,92,.6); }
.mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.dim { font-size: 11.5px; opacity: .6; }
.empty { font-size: 13px; opacity: .7; grid-column: 1 / -1; }
</style>
