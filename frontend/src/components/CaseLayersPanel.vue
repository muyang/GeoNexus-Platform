<script setup>
import { computed } from 'vue'
import { useUiStore } from '@/stores/ui'
import { GEOMETRY_LAYERS, PC1_BANDS, WATER_CLASS_STYLE } from '@/composables/caseStyle'

/** 案例图层面板：四级 LOD + 双时间轴 + 血缘弧线开关 + 报告联动。
 *
 *  设计取舍写在界面上，不只写在注释里：
 *   · 血缘弧线**默认关**——一开就是一堆线，默认开等于默认看不清；
 *   · 两根时间轴**分开画**——数据时间与执行时间混在一根轴上会让人误判因果；
 *   · 非空间案例**不上地球**——硬塞到地图上只会给出一个假的位置。 */

const props = defineProps({
  layers: { type: Object, required: true }   // useCaseLayers() 的返回值
})
defineEmits(['fit'])
const ui = useUiStore()
const l = props.layers

const roleLabel = { data: '数据', knowledge: '知识', model: '模型', skill: '算子',
  workflow: '方案', agent: '智能体', compute: '算力' }
const fmt = (iso) => (iso ? String(iso).replace('T', ' ').slice(0, 16) : '—')
const current = computed(() => l.currentStep.value)
const spatialComponents = computed(() => l.components.value.filter((c) => Array.isArray(c.bbox)))
</script>

<template>
  <div class="sp-card">
    <div class="sp-head">
      <span class="sp-title">{{ l.view.value?.title || '案例图层' }}</span>
      <span class="muted" style="margin-left:auto">{{ l.levelsOn.value.L1 ? l.arclines.value.length : 0 }} 项可定位</span>
    </div>

    <div class="sp-body">
      <p v-if="l.loading.value" class="muted">加载中…</p>
      <p v-else-if="l.error.value" class="pill bad">{{ l.error.value }}</p>

      <template v-else-if="l.view.value">
        <p v-if="!l.spatial.value" class="muted">
          非空间案例：只进侧栏，不上地球（没有范围就没有位置，硬画等于造假）。
        </p>

        <!-- L1 案例范围 -->
        <div class="layer-group">
          <h5>L1 · 案例范围</h5>
          <div class="layer-row">
            <div>
              <div class="name">{{ l.spatial.value ? 'AOI 面' : '无空间范围' }}</div>
              <div class="meta mono">
                {{ l.view.value.bbox ? l.view.value.bbox.map((n) => n.toFixed(1)).join(', ') : '—' }}
              </div>
            </div>
            <div class="acts">
              <button class="icon-btn" type="button" :disabled="!l.spatial.value"
                      @click="l.levelsOn.value.L1 = !l.levelsOn.value.L1">{{ l.levelsOn.value.L1 ? '◉' : '○' }}</button>
              <button class="icon-btn" title="定位" type="button" :disabled="!l.spatial.value"
                      @click="l.view.value.bbox && $emit('fit', l.view.value.bbox)">⌖</button>
            </div>
          </div>

          <!-- 血缘弧线：默认关 -->
          <div class="layer-row">
            <div>
              <div class="name">血缘弧线</div>
              <div class="meta">
                默认关 · 只画选中案例 · 可定位组成项 {{ spatialComponents.length }} / {{ l.components.value.length }}
              </div>
            </div>
            <div class="acts">
              <button class="icon-btn" type="button" :disabled="!l.spatial.value || !spatialComponents.length"
                      @click="l.provenanceOn.value = !l.provenanceOn.value">{{ l.provenanceOn.value ? '◉' : '○' }}</button>
            </div>
          </div>
          <div v-if="l.provenanceOn.value" class="meta" style="margin-top:6px">
            <div v-for="c in l.components.value" :key="c.id" class="mono" style="font-size:11px">
              {{ roleLabel[c.role] || c.role }} · {{ c.id }}
              <template v-if="!c.bbox">（无范围，不画）</template>
              <template v-else-if="c.visibility !== 'public'">（{{ c.visibility }}）</template>
            </div>
          </div>
        </div>


        <!-- 合成/示意标注：从要素属性里读，不靠人记得加 -->
        <el-alert v-if="l.notice.value" type="warning" :closable="false" style="margin-bottom:8px"
                  :title="l.notice.value.text" />

        <!-- 真实几何：面按 class 配色、点按 PC1 分级 -->
        <div class="layer-group">
          <h5>案例几何（矢量，来自平台受控接口）</h5>
          <p v-if="l.geometryError.value" class="pill bad">{{ l.geometryError.value }}</p>
          <div v-for="g in GEOMETRY_LAYERS" :key="g.name" class="layer-row">
            <div>
              <div class="name">{{ g.label }}</div>
              <div class="meta mono">
                <template v-if="g.name === 'sites'">{{ l.siteFeatures.value.length }} 个地点</template>
                <template v-else-if="g.name === 'water_change'">
                  <span v-for="(count, cls) in l.changeCounts.value" :key="cls"
                        :style="{ color: (WATER_CLASS_STYLE[cls] || {}).color, marginRight: '8px' }">
                    {{ (WATER_CLASS_STYLE[cls] || {}).label || cls }} {{ count }} 片
                  </span>
                </template>
                <template v-else>基线水面范围</template>
              </div>
            </div>
            <div class="acts">
              <button class="icon-btn" type="button"
                      @click="l.toggleGeometry(g.name)">{{ l.geometryOn.value[g.name] ? '◉' : '○' }}</button>
            </div>
          </div>

          <!-- PC1 图例：三档与地图上的点一一对应 -->
          <div class="meta" style="margin-top:6px">PC1 图例（点的大小与颜色）</div>
          <div v-for="(band, key) in PC1_BANDS" :key="key" class="meta"
               style="display:flex; align-items:center; gap:6px">
            <i :style="{ width: band.radius + 'px', height: band.radius + 'px', background: band.color,
                         borderRadius: '50%', display: 'inline-block' }"></i>
            <span>{{ band.label }}</span>
          </div>
        </div>

        <!-- 点选地点：与地图点击、列表点击同一份状态 -->
        <div class="layer-group">
          <h5>地点详情</h5>
          <p v-if="!l.selectedSite.value" class="muted">在地图上点一个点，或点下面的行</p>
          <template v-else>
            <dl class="kv">
              <dt>地点</dt><dd>{{ l.selectedSite.value.name || l.selectedSite.value.site_id }}</dd>
              <dt>PC1</dt><dd>{{ l.selectedSite.value.pc1 }}</dd>
              <dt>分级</dt>
              <dd>{{ (PC1_BANDS[l.selectedSite.value.pc1_band] || {}).label || l.selectedSite.value.pc1_band }}</dd>
              <dt>达标种群</dt><dd>{{ l.selectedSite.value.species_meeting_1pct }}</dd>
              <dt>其中受威胁</dt><dd>{{ l.selectedSite.value.threatened_species_meeting_1pct }}</dd>
              <dt>保护状况</dt><dd>{{ l.selectedSite.value.protected_status || '—' }}</dd>
            </dl>
          </template>
          <div v-for="f in l.siteFeatures.value" :key="f.properties.site_id" class="layer-row"
               :style="l.selectedSite.value && l.selectedSite.value.site_id === f.properties.site_id
                 ? 'background:rgba(255,176,32,.12);border-radius:6px' : ''">
            <div style="cursor:pointer" @click="l.selectSite(f.properties)">
              <div class="name">{{ f.properties.name }}</div>
              <div class="meta mono">PC1 {{ f.properties.pc1 }} · 达标种群 {{ f.properties.species_meeting_1pct }}</div>
            </div>
          </div>
        </div>

        <!-- L2 步骤足迹 + 播放 -->
        <div class="layer-group">
          <h5>L2 · 步骤足迹</h5>
          <div class="layer-row">
            <div style="flex:1">
              <div class="name">
                第 {{ l.steps.value.length ? l.stepIndex.value + 1 : 0 }} / {{ l.steps.value.length }} 步
                <span v-if="current" class="mono" style="margin-left:6px">{{ current.stepId }} · {{ current.skill }}</span>
              </div>
              <div class="meta">{{ current ? `${fmt(current.startedAt)} → ${fmt(current.finishedAt)} · ${current.status}` : '无运行记录' }}</div>
              <input type="range" min="0" :max="Math.max(l.steps.value.length - 1, 0)" :value="l.stepIndex.value"
                     style="width:100%" :disabled="l.steps.value.length < 2"
                     @input="l.selectStep(Number($event.target.value))" />
            </div>
            <div class="acts">
              <button class="icon-btn" type="button" :disabled="l.steps.value.length < 2" @click="l.selectStep(l.stepIndex.value - 1)">⏮</button>
              <button class="icon-btn" type="button" :disabled="l.steps.value.length < 2" @click="l.togglePlayback()">{{ l.playing.value ? '⏸' : '▶' }}</button>
              <button class="icon-btn" type="button" :disabled="l.steps.value.length < 2" @click="l.selectStep(l.stepIndex.value + 1)">⏭</button>
            </div>
          </div>
          <div v-for="(s, i) in l.steps.value" :key="s.runId" class="layer-row" :style="i === l.stepIndex.value ? 'background:rgba(87,215,255,.08);border-radius:6px' : ''">
            <div style="cursor:pointer" @click="l.selectStep(i)">
              <div class="name">{{ s.stepId }} · {{ s.skill }}</div>
              <div class="meta mono">{{ fmt(s.startedAt) }} · {{ s.status }}</div>
            </div>
          </div>
        </div>

        <!-- L3 图层组（交付物按角色分组） -->
        <div class="layer-group">
          <h5>L3 · 图层组（交付物）</h5>
          <template v-for="g in l.groups.value" :key="g.role">
            <div class="meta" style="margin-top:4px">{{ roleLabel[g.role] || g.role }}</div>
            <div v-for="d in g.items" :key="d.deliverableId" class="layer-row">
              <div>
                <div class="name">{{ d.name }}</div>
                <div class="meta mono">{{ d.mediaType || '—' }} · {{ d.status }}</div>
              </div>
              <div class="acts">
                <button class="icon-btn" type="button" title="查看报告" :disabled="!d.deliverableId"
                        @click="l.selectDeliverable(d.deliverableId)">▤</button>
                <a v-if="d.deliverableId" class="icon-btn" title="新窗口打开"
                   :href="l.deliverableUrl(d.deliverableId)" target="_blank" rel="noopener">↗</a>
              </div>
            </div>
          </template>
          <p v-if="!l.groups.value.length" class="muted">这次运行还没有交付物</p>
        </div>

        <!-- 双时间轴 -->
        <div class="layer-group">
          <h5>双时间轴</h5>
          <div class="layer-row">
            <div style="flex:1">
              <div class="name">数据时间（案例研究的时段）</div>
              <div class="meta mono">
                {{ l.timeline.value.dataTime ? `${fmt(l.timeline.value.dataTime.start)} → ${fmt(l.timeline.value.dataTime.end)}` : '未声明' }}
              </div>
              <div style="height:4px;border-radius:2px;background:rgba(87,215,255,.35);margin-top:4px"></div>
            </div>
          </div>
          <div class="layer-row">
            <div style="flex:1">
              <div class="name">执行时间（这一次运行）</div>
              <div class="meta mono">
                {{ l.timeline.value.executionTime ? `${fmt(l.timeline.value.executionTime.start)} → ${fmt(l.timeline.value.executionTime.end)}` : '还没有运行' }}
              </div>
              <div style="height:4px;border-radius:2px;background:rgba(60,230,176,.35);margin-top:4px">
                <div :style="{ width: l.timeline.value.progress + '%', height: '100%', background: '#3ce6b0', borderRadius: '2px' }"></div>
              </div>
            </div>
          </div>
          <p class="meta" v-if="l.timeline.value.separate">
            两根轴分开画：结果变了，是数据换了还是重跑过？混在一根轴上就分不清。
          </p>
        </div>

        <!-- L4 报告面板联动 -->
        <div class="layer-group">
          <h5>L4 · 报告面板</h5>
          <p v-if="!l.reportLayer.value?.available" class="muted">这个案例还没有报告类交付物</p>
          <template v-else>
            <div class="layer-row">
              <div>
                <div class="name">联动方式：{{ l.reportLayer.value.linkage === 'on-select' ? '选中即展开' : '手动' }}</div>
                <div class="meta">在 L3 里点 ▤ 展开对应报告</div>
              </div>
            </div>
            <iframe v-if="l.selectedDeliverable.value" :src="l.deliverableUrl(l.selectedDeliverable.value)"
                    style="width:100%;height:260px;border:1px solid var(--e-line);border-radius:8px;background:#fff"
                    title="交付物报告"></iframe>
          </template>
        </div>
      </template>
      <p v-else class="muted">选中一个案例后显示它的四级图层</p>
    </div>
  </div>
</template>

<style scoped>
input[type='range'] { accent-color:#57d7ff }
</style>
