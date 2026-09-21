import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
// 第三方样式必须先于我们自己的样式引入：否则第三方同名优先级会覆盖我们的布局
// （实测：maplibre 的 .maplibregl-map{position:relative} 曾把地球容器的高度压成 0）
import 'maplibre-gl/dist/maplibre-gl.css'
import 'element-plus/dist/index.css'
import './styles/index.css'
import App from './App.vue'
import router from './router'
import { useUiStore } from './stores/ui'

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.use(ElementPlus, { locale: zhCn })

// 语言与主题（主题由路由 meta.shell 决定，见 App.vue）在挂载前初始化
useUiStore().init()

app.mount('#app')
