<script setup>
import { computed, onMounted, ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useUiStore } from '@/stores/ui'
import { cardApi, systemApi } from '@/api'
import SourceTag from '@/components/SourceTag.vue'

const auth = useAuthStore(); const ui = useUiStore()
const tab = ref('profile')
const assets = ref([]); const source = ref(''); const degraded = ref(false); const error = ref('')
const health = ref(null)
const tabs = computed(() => [
  { id: 'profile', label: ui.t('account.profile') },
  { id: 'assets', label: ui.t('account.assets') },
  { id: 'quota', label: ui.t('account.quota') },
  { id: 'audit', label: ui.t('account.audit') }
])

onMounted(async () => {
  const [cards, h] = await Promise.all([cardApi.list(), systemApi.health()])
  assets.value = cards.rows; source.value = cards.source
  degraded.value = cards.degraded; error.value = cards.error || ''; health.value = h
})
</script>

<template>
  <div style="display:flex; flex-direction:column; gap:10px; height:100%">
    <div class="chips" style="margin:0">
      <button v-for="t in tabs" :key="t.id" class="chip chip-btn"
              :class="{ on: tab === t.id }" type="button"
              :style="tab === t.id ? 'border-color:var(--e-cyan);color:var(--e-ink)' : ''"
              @click="tab = t.id">{{ t.label }}</button>
    </div>

    <div v-if="tab === 'profile'">
      <dl class="kv">
        <dt>账号</dt><dd>{{ auth.user?.email || '—' }}</dd>
        <dt>姓名</dt><dd>{{ auth.user?.name || '—' }}</dd>
        <dt>单位</dt><dd>{{ auth.user?.org || '—' }}</dd>
        <dt>角色</dt><dd>{{ auth.roles.join(' · ') || 'org_member' }}</dd>
        <dt>scopes</dt><dd class="mono">{{ auth.scopes.join(' · ') || '—' }}</dd>
      </dl>
      <p class="muted" style="margin-top:12px">
        个人中心只做**聚合视图**：资料来自平台账号，任务/资产/配额分别来自 SDK Job 与 GeoCard 目录，本页不存副本。
      </p>
    </div>

    <div v-else-if="tab === 'assets'" style="display:flex; flex-direction:column; gap:8px; min-height:0">
      <SourceTag :source="source" :degraded="degraded" :error="error" />
      <div class="earth-list" style="overflow:auto">
        <div v-for="c in assets" :key="c.id" class="earth-card">
          <h4>{{ c.title || c.id }}</h4>
          <p><span class="pill">{{ c.type }}</span> <span class="mono">{{ c.owner || c.provider }}</span></p>
        </div>
      </div>
    </div>

    <div v-else-if="tab === 'quota'">
      <dl class="kv">
        <dt>部门额度</dt><dd>待接入（mogan_quota）</dd>
        <dt>个人上限</dt><dd>待接入</dd>
        <dt>OGE 计量</dt><dd>由平台记账（OGE 侧只看到平台这个应用）</dd>
        <dt>调度占用</dt><dd class="mono">{{ health?.status || 'unknown' }}</dd>
      </dl>
    </div>

    <div v-else>
      <dl class="kv">
        <dt>登录日志</dt><dd>sys_logininfor（待接入）</dd>
        <dt>操作日志</dt><dd>sys_oper_log（待接入）</dd>
        <dt>任务审计</dt><dd>mogan_audit（待接入）</dd>
        <dt>关联键</dt><dd class="mono">request_id</dd>
      </dl>
    </div>
  </div>
</template>
