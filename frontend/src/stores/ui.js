import { defineStore } from 'pinia'
import { translate } from '@/i18n'

const LANG_KEY = 'gnx.lang'

export const useUiStore = defineStore('ui', {
  state: () => ({
    lang: 'zh',
    sidebarOpen: true,
    basemapDark: import.meta.env.VITE_BASEMAP_DARK || 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
    basemapLight: import.meta.env.VITE_BASEMAP_LIGHT || 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json'
  }),
  actions: {
    init() {
      const saved = localStorage.getItem(LANG_KEY)
      if (saved === 'zh' || saved === 'en') this.lang = saved
    },
    setLang(lang) {
      this.lang = lang === 'en' ? 'en' : 'zh'
      localStorage.setItem(LANG_KEY, this.lang)
    },
    toggleLang() { this.setLang(this.lang === 'zh' ? 'en' : 'zh') },
    t(key, fallback) { return translate(this.lang, key, fallback) },
    toggleSidebar() { this.sidebarOpen = !this.sidebarOpen }
  }
})
