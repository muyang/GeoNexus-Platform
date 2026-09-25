<script setup>
/** 统一页面骨架 —— 对齐参照站：每个模块页都有「大标题 + 一句说明 + 右侧动作」的头部。
 *
 *  为什么值得做成组件：改版前各页各写各的头部（有的有标题、有的没有、有的把说明塞进
 *  抽屉），模块之间视觉上分不开，用户不知道自己在哪一页。头部固定下来，模块才有边界。
 */
defineProps({
  title: { type: String, required: true },
  subtitle: { type: String, default: '' },
  /** 窄栏模式：案例页这类"左列表 + 右详情"的页面用 max-width: none */
  wide: { type: Boolean, default: false },
  /** 全幅模式：地图页铺满视口，不套内边距 */
  bleed: { type: Boolean, default: false }
})
</script>

<template>
  <section class="page" :class="{ 'page-bleed': bleed }">
    <header v-if="!bleed" class="page-head">
      <div class="page-head-text">
        <h1>{{ title }}</h1>
        <p v-if="subtitle">{{ subtitle }}</p>
      </div>
      <div class="page-head-actions"><slot name="actions" /></div>
    </header>
    <div class="page-body" :class="{ 'page-body-wide': wide }">
      <slot />
    </div>
  </section>
</template>

<style scoped>
.page { display: flex; flex-direction: column; min-height: 0; height: 100%; overflow: auto; }
.page-bleed { overflow: hidden; }

/* 头部：大标题 + 一句说明，宽度与主体一致（对齐参照站 1600px 视口下的左对齐） */
.page-head {
  display: flex; align-items: flex-start; gap: 16px;
  padding: 26px 32px 18px;
  border-bottom: 1px solid var(--e-line, rgba(255, 255, 255, .08));
}
.page-head-text h1 { margin: 0; font-size: 30px; font-weight: 700; letter-spacing: .01em; }
.page-head-text p { margin: 6px 0 0; max-width: 900px; font-size: 13px; line-height: 1.6; opacity: .78; }
.page-head-actions { margin-left: auto; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }

.page-body { padding: 20px 32px 40px; min-height: 0; }
.page-body-wide { padding: 20px 32px 40px; }

@media (max-width: 900px) {
  .page-head { padding: 18px 16px 14px; }
  .page-body, .page-body-wide { padding: 14px 16px 28px; }
  .page-head-text h1 { font-size: 24px; }
}
</style>
