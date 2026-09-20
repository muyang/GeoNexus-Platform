<script setup>
import { useUiStore } from '@/stores/ui'
import { useAuthStore } from '@/stores/auth'
const ui = useUiStore(); const auth = useAuthStore()
const groups = [
  { t: '用户与组织', d: 'sys_user · sys_dept · sys_post', perm: 'system:user:list' },
  { t: '角色与权限', d: 'sys_role（data_scope 1–5）· sys_menu（perms）· sys_role_menu', perm: 'system:role:list' },
  { t: '资源与服务', d: '资源上下架 · 服务注册 / 启停 / 配额', perm: 'resource:manage' },
  { t: '开发管理', d: '服务账号 app_id/secret · 接口授权白名单', perm: 'app:manage' },
  { t: '审批管理', d: '资产发布 / 上架 / 提权（mogan_approval）', perm: 'approval:list' },
  { t: '配额与看板', d: '部门与个人额度 · 调用量 · 任务成功率', perm: 'quota:read' }
]
</script>

<template>
  <div class="page-head">
    <h1>{{ ui.t('nav.admin') }}</h1>
    <p>后台管理按目标架构落在 RuoYi（Java）：账号、组织、角色、菜单为原生模块；资源/服务/开发/审批/配额为扩展菜单。</p>
  </div>
  <div class="notice" style="margin-bottom:14px">
    当前登录角色：<span class="mono">{{ auth.roles.join(' · ') || '—' }}</span>；
    scopes：<span class="mono">{{ auth.scopes.join(' · ') || '—' }}</span>。
    本页进入条件是 <span class="mono">system:user:list</span>，公众账号会被守卫拦到 403。
  </div>
  <div class="card-grid">
    <div v-for="g in groups" :key="g.t" class="card">
      <h3>{{ g.t }}</h3>
      <p class="mono" style="font-size:12px">{{ g.d }}</p>
      <p style="margin-top:8px">
        <span class="tag" :style="auth.hasPerm(g.perm) ? '' : 'opacity:.5'">
          {{ auth.hasPerm(g.perm) ? '有权限' : '需 ' + g.perm }}
        </span>
      </p>
    </div>
  </div>
</template>
