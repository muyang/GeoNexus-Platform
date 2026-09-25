<script setup>
/** 统一应用壳（对齐参照站）：顶部品牌 + 一条九模块导航 + 全宽内容区。
 *
 *  改版前的两个壳（浅色门户 / 深色地球+抽屉）导致同一件事要在两套导航之间切换，
 *  而且抽屉把主体挤成一条。这个壳没有抽屉：内容区全宽，页面自己决定内部布局
 *  （列表+详情、卡片栅格、全屏地图…），地图只在需要它的页面里出现。
 */
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import NavStickers from '@/components/NavStickers.vue'
import LangThemeChips from '@/components/LangThemeChips.vue'
import { useUiStore } from '@/stores/ui'
import { useAuthStore } from '@/stores/auth'

const ui = useUiStore(); const router = useRouter()
</script>

<template>
  <div class="app">
    <header class="app-topbar">
      <button class="app-brand" type="button" @click="router.push({ name: 'home' })">
        <span class="ico" />
        <span class="title">{{ ui.t('app.title') }}</span>
      </button>
      <NavStickers />
      <!-- 右侧只保留一份状态区：语言/主题/登录都在 LangThemeChips 里，
           这里不再重复渲染，否则截图里会出现两个"登录"。 -->
      <div style="margin-left:auto"><LangThemeChips /></div>
    </header>
    <main class="app-main"><slot /></main>
  </div>
</template>

<style scoped>
.app { display: flex; flex-direction: column; height: 100vh; min-height: 0; }
.app-topbar {
  display: flex; align-items: center; gap: 18px; flex: none;
  padding: 10px 20px; border-bottom: 1px solid var(--e-line, rgba(255, 255, 255, .08));
  background: rgba(10, 14, 24, .72); backdrop-filter: blur(8px); z-index: 3;
}
.app-brand { display: flex; align-items: center; gap: 9px; background: transparent; border: 0;
  color: inherit; cursor: pointer; font: inherit; padding: 0; }
.app-brand .ico { width: 22px; height: 22px; border-radius: 50%;
  background: radial-gradient(circle at 30% 30%, #8fe6ff, #2f6fed 70%); }
.app-brand .title { font-size: 15px; font-weight: 600; letter-spacing: .02em; }
.app-main { flex: 1; min-height: 0; display: flex; flex-direction: column; }
@media (max-width: 900px) {
  .app-topbar { flex-wrap: wrap; gap: 10px; }
}
</style>
