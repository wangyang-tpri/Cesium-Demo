<script setup lang="ts">
import * as Cesium from 'cesium';
import { ref } from 'vue';
import { useCesiumViewer } from '@/hooks/useCesiumViewer';
import { useCodeExplain } from '@/hooks/useCodeExplain';
import CodePanel from '@/components/base/CodePanel.vue';

const containerRef = ref<HTMLDivElement | null>(null);
const activeFeature = ref('esri-img');
const statusText = ref('当前底图：Esri 全球影像');

const { viewer } = useCesiumViewer(containerRef, {
  baseLayer: 'esri',
  camera: { position: [108.9, 34.2, 3000000], pitch: -60 },
});

let terrainOn = false;
let overlayLayer: Cesium.ImageryLayer | null = null;

/** 替换当前所有影像图层 */
function setBaseLayer(provider: Cesium.ImageryProvider) {
  const v = viewer.value;
  if (!v) return;
  v.imageryLayers.removeAll();
  v.imageryLayers.add(new Cesium.ImageryLayer(provider));
}

function applyEsriImage() {
  activeFeature.value = 'esri-img';
  setBaseLayer(
    new Cesium.UrlTemplateImageryProvider({
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      credit: 'Imagery © Esri, Maxar, Earthstar Geographics',
      maximumLevel: 19,
    })
  );
  statusText.value = '当前底图：Esri 全球影像（卫星图）';
}

function applyEsriStreet() {
  activeFeature.value = 'esri-map';
  setBaseLayer(
    new Cesium.UrlTemplateImageryProvider({
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
      credit: '© Esri, HERE, Garmin, OpenStreetMap contributors',
      maximumLevel: 19,
    })
  );
  statusText.value = '当前底图：Esri 街道图（矢量风格）';
}

function applyNaturalEarth() {
  activeFeature.value = 'natural';
  const v = viewer.value;
  if (!v) return;
  v.imageryLayers.removeAll();
  // 使用 Cesium 本地内置的自然地球纹理（无需网络）
  Cesium.TileMapServiceImageryProvider.fromUrl(Cesium.buildModuleUrl('Assets/Textures/NaturalEarthII'))
    .then((p) => v.imageryLayers.add(new Cesium.ImageryLayer(p)))
    .catch((e) => console.error(e));
  statusText.value = '当前底图：Natural Earth（本地纹理）';
}

function applyNoBase() {
  activeFeature.value = 'none';
  const v = viewer.value;
  if (!v) return;
  v.imageryLayers.removeAll();
  // 无影像时地球底色可自定义（此处用深蓝海洋色）
  v.scene.globe.baseColor = Cesium.Color.fromCssColorString('#1e3a5f');
  statusText.value = '当前底图：无（纯椭球 + 经纬网）';
}

function applyTerrain() {
  activeFeature.value = 'terrain';
  const v = viewer.value;
  if (!v) return;
  terrainOn = !terrainOn;
  if (terrainOn) {
    // Cesium World Terrain：全球真实地形高程（含海底）
    v.scene.setTerrain(new Cesium.Terrain(Cesium.createWorldTerrainAsync()));
    v.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(86.925, 27.988, 300000), // 珠穆朗玛峰
      orientation: { heading: 0, pitch: Cesium.Math.toRadians(-45), roll: 0 },
      duration: 2,
    });
    statusText.value = '地形：Cesium World Terrain（已飞往珠峰）';
  } else {
    v.terrainProvider = new Cesium.EllipsoidTerrainProvider();
    statusText.value = '地形：已还原为椭球面（无地形）';
  }
}

function applyOverlay() {
  activeFeature.value = 'overlay';
  const v = viewer.value;
  if (!v) return;
  if (overlayLayer) {
    v.imageryLayers.remove(overlayLayer);
    overlayLayer = null;
    statusText.value = '叠加层：已移除';
    return;
  }
  // 在现有底图上叠加一层街道图，半透明显示
  overlayLayer = new Cesium.ImageryLayer(
    new Cesium.UrlTemplateImageryProvider({
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
      credit: '© Esri',
      maximumLevel: 19,
    })
  );
  overlayLayer.alpha = 0.5; // 图层透明度
  overlayLayer.brightness = 1.1;
  v.imageryLayers.add(overlayLayer);
  statusText.value = '叠加层：街道图 alpha=0.5 覆盖在影像上';
}

const codeMap: Record<string, () => string> = {
  'esri-img': () => `// ① Esri 全球影像（无 token，国内可用）
const provider = new Cesium.UrlTemplateImageryProvider({
  // 注意瓦片顺序是 {z}/{y}/{x}
  url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  maximumLevel: 19,
})
viewer.imageryLayers.add(new Cesium.ImageryLayer(provider))`,

  'esri-map': () => `// ② Esri 街道图（矢量风格底图）
const provider = new Cesium.UrlTemplateImageryProvider({
  url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
  maximumLevel: 19,
})
viewer.imageryLayers.add(new Cesium.ImageryLayer(provider))`,

  none: () => `// ③ 无影像：纯椭球 + 可自定义底色
viewer.imageryLayers.removeAll()
viewer.scene.globe.baseColor =
  Cesium.Color.fromCssColorString('#1e3a5f')
// 经纬网线：globe.showGroundAtmosphere 等也与此相关`,

  natural: () => `// ④ 本地内置纹理：Natural Earth（离线可用）
const layer = await Cesium.ImageryLayer.fromProviderAsync(
  Cesium.TileMapServiceImageryProvider.fromUrl(
    Cesium.buildModuleUrl('Assets/Textures/NaturalEarthII')
  )
)
viewer.imageryLayers.add(layer)`,

  terrain: () => `// ⑤ 全球真实地形（Cesium World Terrain）
viewer.scene.setTerrain(
  new Cesium.Terrain(Cesium.createWorldTerrainAsync())
)
// 还原为椭球面（无地形）
viewer.terrainProvider = new Cesium.EllipsoidTerrainProvider()
// ★ 有地形后：贴地对象需设置 heightReference`,

  overlay: () => `// ⑥ 多图层叠加 + 透明度
const overlay = new Cesium.ImageryLayer(provider)
overlay.alpha = 0.5        // 不透明度
overlay.brightness = 1.1   // 亮度
overlay.saturation = 0.8   // 饱和度
viewer.imageryLayers.add(overlay)  // 叠在现有图层之上`,
};

const explainMap: Record<string, () => string> = {
  'esri-img': () => `【原理】UrlTemplateImageryProvider 按 {z}/{x}/{y} 模板拼接瓦片 URL。
瓦片金字塔：z 为缩放级别，x/y 为行列号。
ImageryLayer 将 Provider 包装成可叠加、可调透明度/亮度的图层。

【要点】Esri World Imagery 无 key 即可访问，适合国内开发调试；
生产环境建议使用自有底图服务或天地图/Azure 地图。`,

  'esri-map': () => `【原理】与影像图同构，只是换了瓦片服务（矢量渲染后的栅格图）。
多底图切换的本质：移除旧图层 → 添加新图层。

【要点】imageryLayers.removeAll() 清空；add() 追加到最上层；
layers.indexOf() 可调整顺序。`,

  none: () => `【原理】移除影像后地球只剩椭球体，globe.baseColor 决定底色。
这是“白膜/暗夜模式”等场景的基础做法。

【要点】经纬网（globe.showGroundAtmosphere）与网格开关可继续叠加。`,

  natural: () => `【原理】Cesium 安装包内置了 Natural Earth 全球纹理（Build/Cesium/Assets/Textures）。
buildModuleUrl() 把资源路径解析到 CESIUM_BASE_URL 下，完全离线可用。

【要点】这是快速验证/无网环境下的兜底底图方案。`,

  terrain: () => `【原理】Cesium World Terrain 提供全球 30m 分辨率真实高程，
地形起伏来自 Quantized-Mesh 瓦片，按视距动态细化。
对比：椭球面（EllipsoidTerrainProvider）无起伏。

【观察】切换到地形后飞往珠峰，可看到真实山体；再次点击还原为光滑球面。

【要点】地形开启后，贴地实体建议设置 heightReference: CLAMP_TO_GROUND。`,

  overlay: () => `【原理】imageryLayers 支持任意多层叠加，每层可独立调节：
alpha 不透明度 / brightness 亮度 / contrast 对比度 / saturation 饱和度 / hue 色相。

【观察】当前在影像上叠加 50% 透明度的街道图，道路与卫星影像融合显示。`,
};

const { code, explanation } = useCodeExplain(codeMap, explainMap, activeFeature);
</script>

<template>
  <div class="flex h-full flex-col gap-3 p-4">
    <div class="flex flex-wrap items-center gap-2">
      <n-button size="small" :type="activeFeature === 'esri-img' ? 'primary' : 'default'" @click="applyEsriImage">Esri 影像</n-button>
      <n-button size="small" :type="activeFeature === 'esri-map' ? 'primary' : 'default'" @click="applyEsriStreet">Esri 街道图</n-button>
      <n-button size="small" :type="activeFeature === 'natural' ? 'primary' : 'default'" @click="applyNaturalEarth">Natural Earth</n-button>
      <n-button size="small" :type="activeFeature === 'none' ? 'primary' : 'default'" @click="applyNoBase">无底图</n-button>
      <n-button size="small" :type="activeFeature === 'terrain' ? 'primary' : 'default'" @click="applyTerrain">世界地形：{{ terrainOn ? '开' : '关' }}</n-button>
      <n-button size="small" :type="activeFeature === 'overlay' ? 'primary' : 'default'" @click="applyOverlay">{{ overlayLayer ? '移除叠加层' : '叠加街道图' }}</n-button>
    </div>

    <div class="flex min-h-0 flex-1 gap-3">
      <div class="relative min-w-0 flex-1 overflow-hidden rounded-lg border border-gray-200 shadow-sm">
        <div ref="containerRef" class="h-full w-full"></div>
        <div class="absolute left-3 top-3 z-10 rounded bg-black/60 px-3 py-1.5 text-xs text-white">{{ statusText }}</div>
      </div>
      <CodePanel :title="activeFeature" :code="code" :explanation="explanation" />
    </div>
  </div>
</template>
