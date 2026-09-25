<script setup>
/** 个人中心模块：套统一页面骨架（标题 + 说明 + 动作），内容沿用已有的个人中心组件。
 *  改版后九个模块全部走同一个壳与同一个页面骨架。
 *
 *  这里只做"落进新壳以后的排版收尾"：个人中心原本是绝对定位在地球右栏的窄组件，
 *  直接搬进宽页面会把键值表拉成整行、右边留一大片空。用 :deep 把它的
 *  页签行与键值表收成页内的卡片，并限制宽度，避免读完一行要横跨 1500px。 */
import PageShell from '@/components/PageShell.vue'
import View from '@/views/earth/PersonalCenter.vue'
</script>

<template>
  <PageShell title="个人中心" subtitle="查看身份与权限、我登记的资源、配额与操作记录。">
    <div class="acct"><View /></div>
  </PageShell>
</template>

<style scoped>
.acct :deep(.chips) { margin: 0 0 14px; padding-bottom: 10px; border-bottom: 1px solid var(--e-line); }
.acct :deep(.kv) {
  max-width: 760px; padding: 14px 16px; border-radius: 12px;
  border: 1px solid var(--e-line); background: rgba(255, 255, 255, .02);
}
.acct :deep(.earth-list) { max-width: 900px; }
.acct :deep(.muted) { max-width: 760px; line-height: 1.7; }
</style>
