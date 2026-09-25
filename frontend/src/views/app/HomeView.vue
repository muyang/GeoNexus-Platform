<script setup>
/** 首页（对齐参照站 ref-01）：左文案 + 右地球的两栏；三张能力卡；一个主 CTA；推荐案例。 */
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import PageShell from '@/components/PageShell.vue'
import { useMap } from '@/composables/map'
import { useUiStore } from '@/stores/ui'
import { caseApi } from '@/api'

const ui = useUiStore(); const router = useRouter()
const globeEl = ref(null)
// 地球状态的说辞与地图/案例/工作台共用同一个 computed，避免同一状态四处在写四种话
const { mount, ready, mapStatus } = useMap()
const recommended = ref([])

const abilities = [
  { key: 'data', title: '遥感与数据资源', desc: '登记、检索、按契约取用分布在各节点的数据', to: 'data' },
  { key: 'cases', title: '案例与知识产品', desc: '把研究组织成可复用、可复跑、可交付的案例', to: 'cases' },
  { key: 'workbench', title: '工作流与工作台', desc: '描述任务，得到可审阅的步骤、参数与执行记录', to: 'workbench' }
]

onMounted(async () => {
  await mount(globeEl.value)
  try {
    const r = await caseApi.list()
    recommended.value = r.rows.filter((c) => c.status === 'published' || c.provenance === 'live').slice(0, 3)
  } catch { recommended.value = [] }
})
</script>

<template>
  <PageShell :title="ui.t('app.title')" subtitle="数据留在原地，计算移动到数据：让地理分析、可持续发展评估与地理知识服务在同一个地球上展开。">
    <div class="hg">
      <div class="hg-text">
        <h2>数据留在原地，<br>计算移动到数据</h2>
        <p>连接分布在各节点与各权属方的数据与算力，把分析过程、参数与结论一起留在案例里，供他人复用与复核。</p>
        <div class="hg-actions">
          <button class="btn-primary" type="button" @click="router.push({ name: 'cases' })">浏览公开案例</button>
          <button class="btn-ghost" type="button" @click="router.push({ name: 'map' })">打开地图</button>
        </div>
        <p class="hg-hint">兴趣推荐 · 地表变化探索 · 体验演示向导</p>
      </div>
      <div ref="globeEl" class="hg-globe" aria-label="地球预览">
        <span v-if="!ready" class="hg-globe-state">{{ mapStatus.text }}</span>
      </div>
    </div>

    <div class="ability-grid">
      <button v-for="a in abilities" :key="a.key" class="ability-card" type="button"
              @click="router.push({ name: a.to })">
        <span class="ability-ico" />
        <strong>{{ a.title }}</strong>
        <span class="ability-desc">{{ a.desc }}</span>
        <span class="ability-go">→</span>
      </button>
    </div>

    <h3 class="section-title">推荐案例</h3>
    <div class="rec-grid">
      <button v-for="c in recommended" :key="c.id" class="rec-card" type="button"
              @click="router.push({ name: 'cases', query: { case: c.id } })">
        <strong>{{ c.title }}</strong>
        <span class="rec-meta">{{ c.aoi || c.question || '—' }}</span>
      </button>
      <p v-if="!recommended.length" class="empty">暂时没有可推荐的案例 —— 案例库为空或后端不可达。</p>
    </div>
  </PageShell>
</template>

<style scoped>
.hg { display: grid; grid-template-columns: minmax(320px, 1fr) minmax(320px, 1.1fr); gap: 28px; align-items: center; }
.hg-text h2 { margin: 0 0 12px; font-size: 40px; line-height: 1.2; font-weight: 800; letter-spacing: .01em; }
.hg-text p { margin: 0 0 18px; font-size: 14px; line-height: 1.7; opacity: .8; max-width: 520px; }
.hg-actions { display: flex; gap: 10px; }
.btn-primary, .btn-ghost { height: 38px; padding: 0 18px; border-radius: 9px; font: inherit; font-size: 14px; cursor: pointer; }
.btn-primary { border: 1px solid var(--e-cyan, #57d7ff); background: rgba(87, 215, 255, .16); color: inherit; font-weight: 600; }
.btn-ghost { border: 1px solid var(--e-line, rgba(255,255,255,.12)); background: transparent; color: inherit; }
.hg-hint { margin-top: 14px; font-size: 12px; opacity: .6; }
.hg-globe { position: relative; height: 380px; border-radius: 14px; overflow: hidden;
  border: 1px solid var(--e-line, rgba(255,255,255,.08)); }
.hg-globe-state { position: absolute; inset: auto 12px 12px auto; font-size: 12px; opacity: .6; }
.ability-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 12px; margin-top: 26px; }
.ability-card { position: relative; text-align: left; padding: 16px; border-radius: 12px; cursor: pointer;
  border: 1px solid var(--e-line, rgba(255,255,255,.08)); background: rgba(255,255,255,.02); color: inherit; font: inherit; }
.ability-card:hover { border-color: var(--e-cyan, #57d7ff); }
.ability-ico { display: block; width: 22px; height: 22px; margin-bottom: 10px; border-radius: 6px;
  background: linear-gradient(135deg, #57d7ff, #2f6fed); }
.ability-card strong { display: block; font-size: 14.5px; }
.ability-desc { display: block; margin-top: 4px; font-size: 12.5px; opacity: .72; line-height: 1.5; }
.ability-go { position: absolute; top: 14px; right: 14px; opacity: .5; }
.section-title { margin: 28px 0 10px; font-size: 15px; letter-spacing: .04em; opacity: .8; }
.rec-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; }
.rec-card { text-align: left; padding: 14px; border-radius: 12px; cursor: pointer; color: inherit; font: inherit;
  border: 1px solid var(--e-line, rgba(255,255,255,.08)); background: rgba(255,255,255,.02); }
.rec-card:hover { border-color: var(--e-cyan, #57d7ff); }
.rec-meta { display: block; margin-top: 6px; font-size: 12px; opacity: .7; }
.empty { font-size: 13px; opacity: .7; }
@media (max-width: 980px) { .hero { grid-template-columns: 1fr; } .hg-text h2 { font-size: 30px; } }
</style>
