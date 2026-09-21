<script setup>
import { onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { settingsApi } from '@/api'
import { BASEMAPS } from '@/composables/basemaps'

/** 地图设置：前端用哪个引擎、哪个底图、什么投影，都在这里定。
 *  引擎/底图是**站点级配置**（存后端 settings 表，公开可读），保存后刷新页面生效。 */
const form = ref({
  'map.engine': 'cesium',
  'map.basemap': 'satellite',
  'map.projection': '3d',
  'map.showGeoCards': true,
  'map.homeView': { lon: 110, lat: 30, height: 20000000 }
})
const loading = ref(false); const error = ref(''); const dirty = ref(false)

async function load() {
  loading.value = true; error.value = ''
  try {
    const s = await settingsApi.get()
    form.value = { ...s }
    dirty.value = false
  } catch (e) { error.value = e.message } finally { loading.value = false }
}

async function save() {
  loading.value = true; error.value = ''
  try {
    const s = await settingsApi.update(form.value)
    form.value = { ...s }; dirty.value = false
    ElMessage.success('已保存，刷新页面后生效')
  } catch (e) { ElMessage.error(e.message) } finally { loading.value = false }
}
onMounted(load)
</script>

<template>
  <div v-loading="loading">
    <el-alert v-if="error" type="error" :title="error" :closable="false" style="margin-bottom:12px" />
    <el-alert type="info" :closable="false" style="margin-bottom:14px"
      title="这些设置决定前端如何渲染地球/地图。默认是 3D 地球（Cesium）；若现场终端性能不足或需要看矢量底图，可切到 2D 地图（MapLibre）。保存后刷新页面生效。" />

    <el-form label-width="130px" style="max-width:640px">
      <el-form-item label="地图引擎">
        <el-radio-group v-model="form['map.engine']" @change="dirty = true">
          <el-radio-button value="cesium">Cesium · 3D 地球（默认）</el-radio-button>
          <el-radio-button value="maplibre">MapLibre · 2D 地图</el-radio-button>
        </el-radio-group>
        <div class="dim" style="font-size:12px; margin-top:4px">
          Cesium：真三维地球、可加地形与倾斜摄影；包体较大（首次加载约 1MB+）。
          MapLibre：轻量、支持矢量瓦片；在弱终端或带宽受限时更稳。
        </div>
      </el-form-item>

      <el-form-item label="投影">
        <el-radio-group v-model="form['map.projection']" :disabled="form['map.engine'] !== 'cesium'" @change="dirty = true">
          <el-radio-button value="3d">3D 地球</el-radio-button>
          <el-radio-button value="2d">2D 平面</el-radio-button>
        </el-radio-group>
      </el-form-item>

      <el-form-item label="默认底图">
        <el-select v-model="form['map.basemap']" style="width:260px" @change="dirty = true">
          <el-option v-for="b in BASEMAPS" :key="b.id" :value="b.id" :label="`${b.label}（${b.raster ? '栅格' : '矢量'}）`" />
        </el-select>
        <div class="dim" style="font-size:12px; margin-top:4px">
          提示：Cesium 原生不支持矢量瓦片，选矢量底图时会自动使用同色系栅格。
        </div>
      </el-form-item>

      <el-form-item label="显示 GeoCard 覆盖">
        <el-switch v-model="form['map.showGeoCards']" @change="dirty = true" />
      </el-form-item>

      <el-form-item label="默认视角">
        <el-input-number v-model="form['map.homeView'].lon" :min="-180" :max="180" :precision="1" @change="dirty = true" />
        <span class="dim" style="margin:0 6px">经度</span>
        <el-input-number v-model="form['map.homeView'].lat" :min="-90" :max="90" :precision="1" @change="dirty = true" />
        <span class="dim" style="margin:0 6px">纬度</span>
        <el-input-number v-model="form['map.homeView'].height" :min="1000" :max="40000000" :step="1000000" @change="dirty = true" />
        <span class="dim" style="margin-left:6px">高度(米)</span>
      </el-form-item>

      <el-form-item>
        <el-button type="primary" :disabled="!dirty" @click="save">保存</el-button>
        <el-button @click="load">重新载入</el-button>
        <span v-if="dirty" class="dim" style="margin-left:10px">有未保存改动</span>
      </el-form-item>
    </el-form>
  </div>
</template>
